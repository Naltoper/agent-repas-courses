"""Gemini Function Calling orchestrator for SmartChef Agent."""

from __future__ import annotations

import time
import uuid
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.agent import tools as agent_tools
from app.core.config import get_settings
from app.core.gemini_models import resolve_model_chain
from app.models.schemas import AgentSession, MenuPlan, ModelSelectionMode, UserProfile
from app.storage import profile_store, run_store


def _system_instruction(profile: UserProfile) -> str:
    regimes = ", ".join(r.value for r in profile.dietary_regimes)
    notes = profile.notes.strip() or "(aucune)"
    return f"""Tu es SmartChef, un agent de planification de repas.
Tu DOIS utiliser l'outil `{agent_tools.GENERATE_MENU_NAME}` pour enregistrer le menu final.
Ne te contente pas d'une réponse textuelle : appelle l'outil avec un planning cohérent.

Contraintes profil utilisateur :
- Nombre de personnes : {profile.household_size}
- Budget hebdomadaire cible : {profile.weekly_budget_eur} €
- Régimes / préférences : {regimes}
- Notes : {notes}

Règles :
- Propose un menu pour environ 7 jours (dîners), équilibré et réaliste.
- Les titres de recettes du planning doivent correspondre aux fiches `recipes`.
- Portions adaptées au nombre de personnes.
- Respecte strictement les régimes et notes.
- Réponds en français dans les titres, étapes et notes.
"""


def _is_transient(exc: Exception) -> bool:
    text = str(exc)
    return any(
        code in text
        for code in ("429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE")
    )


def _generate_with_model_strategy(
    client: genai.Client,
    *,
    model_chain: list[str],
    selection_mode: ModelSelectionMode,
    contents: list[types.Content],
    config: types.GenerateContentConfig,
    run_id: str,
    per_model_attempts: int = 2,
):
    """
    Try models in order.
    - manual: only preferred model (retries on transient errors).
    - auto: on 429 / unavailability after retries, switch to next fallback.
    """
    last_exc: Exception | None = None

    for model_index, model in enumerate(model_chain):
        for attempt in range(1, per_model_attempts + 1):
            try:
                if attempt == 1:
                    run_store.append_log(run_id, f"Modèle actif : {model}")
                return client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                ), model
            except genai_errors.APIError as exc:
                # 429 often ClientError; 503 often ServerError — both subclass APIError
                last_exc = exc
                transient = _is_transient(exc)
                code = getattr(exc, "code", "?")

                if not transient:
                    raise

                can_retry_same = attempt < per_model_attempts
                can_fallback = (
                    selection_mode == ModelSelectionMode.AUTO
                    and model_index < len(model_chain) - 1
                )

                if can_retry_same:
                    wait_s = min(12, 3 * attempt)
                    run_store.append_log(
                        run_id,
                        (
                            f"[{model}] indisponible ({code}) — "
                            f"nouvel essai dans {wait_s}s ({attempt}/{per_model_attempts})"
                        ),
                        level="warn",
                    )
                    time.sleep(wait_s)
                    continue

                if can_fallback:
                    nxt = model_chain[model_index + 1]
                    run_store.append_log(
                        run_id,
                        (
                            f"[{model}] échec durable ({code}) — "
                            f"bascule auto vers {nxt}"
                        ),
                        level="warn",
                    )
                    break  # next model in outer loop

                raise

    assert last_exc is not None
    raise last_exc


def start_run(prompt: str) -> AgentSession:
    """Create a pending session; always reload profile from disk for this run."""
    profile = profile_store.load_profile()
    session = AgentSession(
        id=str(uuid.uuid4()),
        status="pending",
        prompt=prompt.strip(),
        profile=profile,
        logs=[],
    )
    run_store.create_run(session)
    run_store.append_log(session.id, "Session créée — en attente d’exécution")
    run_store.append_log(
        session.id,
        (
            f"Profil modèles : mode={profile.model_selection_mode.value}, "
            f"préféré={profile.preferred_model}"
        ),
    )
    return run_store.get_run(session.id) or session


def execute_run(run_id: str) -> None:
    """Blocking Gemini tool loop — intended to run in a worker thread."""
    session = run_store.get_run(run_id)
    if session is None:
        return

    settings = get_settings()
    if not settings.has_gemini:
        run_store.update_run(
            run_id,
            status="failed",
            error="GEMINI_API_KEY manquante — configurez backend/.env",
        )
        run_store.append_log(
            run_id,
            "Échec : clé Gemini absente",
            level="error",
        )
        failed = run_store.get_run(run_id)
        if failed:
            run_store.persist_latest(failed)
        return

    # Fresh profile from store for each run (not a stale in-memory copy)
    profile = profile_store.load_profile()
    model_chain = resolve_model_chain(profile)
    run_store.update_run(run_id, status="running", profile=profile)
    run_store.append_log(
        run_id,
        (
            f"Chaîne modèles ({profile.model_selection_mode.value}) : "
            + " → ".join(model_chain)
        ),
    )

    client = genai.Client(api_key=settings.gemini_api_key.strip())
    contents: list[types.Content] = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=session.prompt)],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=_system_instruction(profile),
        tools=agent_tools.tool_definitions(),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.6,
    )

    menu: MenuPlan | None = None
    summary: str | None = None
    active_model = model_chain[0]
    max_rounds = max(1, settings.agent_max_tool_rounds)

    try:
        for round_idx in range(1, max_rounds + 1):
            run_store.append_log(
                run_id,
                f"Appel Gemini — tour {round_idx}/{max_rounds}",
            )
            response, active_model = _generate_with_model_strategy(
                client,
                model_chain=model_chain,
                selection_mode=profile.model_selection_mode,
                contents=contents,
                config=config,
                run_id=run_id,
            )

            candidate = (response.candidates or [None])[0]
            if candidate is None or candidate.content is None:
                raise RuntimeError("Réponse Gemini vide")

            model_content = candidate.content
            contents.append(model_content)

            function_calls = [
                part.function_call
                for part in (model_content.parts or [])
                if part.function_call and part.function_call.name
            ]

            text_bits = [
                part.text.strip()
                for part in (model_content.parts or [])
                if part.text and part.text.strip()
            ]
            if text_bits:
                summary = "\n".join(text_bits)
                run_store.append_log(
                    run_id,
                    f"Message modèle : {summary[:280]}{'…' if len(summary) > 280 else ''}",
                )

            if not function_calls:
                if menu is not None:
                    break
                run_store.append_log(
                    run_id,
                    "Aucun appel d’outil — le modèle n’a pas encore enregistré de menu",
                    level="warn",
                )
                if round_idx < max_rounds:
                    contents.append(
                        types.Content(
                            role="user",
                            parts=[
                                types.Part.from_text(
                                    text=(
                                        f"Merci d'appeler maintenant l'outil "
                                        f"`{agent_tools.GENERATE_MENU_NAME}` "
                                        "avec le planning complet."
                                    )
                                )
                            ],
                        )
                    )
                    continue
                break

            function_response_parts: list[types.Part] = []
            for call in function_calls:
                name = call.name or ""
                raw_args: dict[str, Any] = dict(call.args or {})
                run_store.append_log(
                    run_id,
                    f"Exécution outil `{name}`",
                    tool=name,
                )
                try:
                    if name == agent_tools.GENERATE_MENU_NAME:
                        menu, tool_result = agent_tools.execute_generate_menu(
                            raw_args,
                            prompt=session.prompt,
                            profile=profile,
                        )
                        run_store.update_run(run_id, result=menu)
                        run_store.append_log(
                            run_id,
                            (
                                f"Menu OK — {tool_result['days_count']} jour(s), "
                                f"{tool_result['recipes_count']} recette(s) "
                                f"(via {active_model})"
                            ),
                            tool=name,
                            level="success",
                        )
                    else:
                        tool_result = {"ok": False, "error": f"Outil inconnu: {name}"}
                        run_store.append_log(
                            run_id,
                            tool_result["error"],
                            tool=name,
                            level="error",
                        )
                except Exception as exc:  # noqa: BLE001
                    tool_result = {"ok": False, "error": str(exc)}
                    run_store.append_log(
                        run_id,
                        f"Erreur outil : {exc}",
                        tool=name,
                        level="error",
                    )

                function_response_parts.append(
                    types.Part.from_function_response(
                        name=name,
                        response=tool_result,
                    )
                )

            contents.append(
                types.Content(role="user", parts=function_response_parts)
            )

            if menu is not None:
                break

        if menu is None:
            run_store.update_run(
                run_id,
                status="failed",
                error="L’agent n’a pas produit de menu via generate_menu",
                summary=summary,
            )
            run_store.append_log(
                run_id,
                "Échec : aucun menu structuré enregistré",
                level="error",
            )
        else:
            run_store.update_run(
                run_id,
                status="completed",
                result=menu,
                summary=summary,
                error=None,
            )
            run_store.append_log(
                run_id,
                f"Exécution terminée avec succès (modèle {active_model})",
                level="success",
            )

    except Exception as exc:  # noqa: BLE001
        run_store.update_run(
            run_id,
            status="failed",
            error=str(exc),
            summary=summary,
        )
        run_store.append_log(run_id, f"Erreur agent : {exc}", level="error")

    final = run_store.get_run(run_id)
    if final:
        run_store.persist_latest(final)
