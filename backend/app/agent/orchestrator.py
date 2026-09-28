"""Gemini Function Calling orchestrator for SmartChef Agent."""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.agent import tools as agent_tools
from app.core.config import get_settings
from app.core.gemini_models import resolve_model_chain
from app.models.schemas import (
    AgentSession,
    ChatMessage,
    MenuPlan,
    ModelSelectionMode,
    UserProfile,
)
from app.storage import profile_store, run_store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _system_instruction(profile: UserProfile, *, follow_up: bool = False) -> str:
    regimes = ", ".join(r.value for r in profile.dietary_regimes)
    notes = profile.notes.strip() or "(aucune)"
    base = f"""Tu es SmartChef, un agent de planification de repas et de courses.
Tu utilises les outils disponibles pour enregistrer le menu, la liste de courses et le budget.
Ne te contente pas d'une réponse textuelle quand une action structurée est nécessaire.

Contraintes profil :
- Nombre de personnes : {profile.household_size}
- Nombre de jours de recettes : {profile.recipe_days}
- Budget hebdomadaire cible : {profile.weekly_budget_eur} €
- Régimes / préférences : {regimes}
- Notes : {notes}

Règles :
- Le planning DOIT contenir exactement {profile.recipe_days} jour(s).
- Chaque recette DOIT inclure `prep_time_minutes` (entier réaliste, ex. 20–45 min).
- Après un menu (initial ou modifié), appelle `build_shopping_list` puis `estimate_budget`.
- Portions adaptées au nombre de personnes.
- Respecte régimes et notes.
- Réponds en français.
"""
    if follow_up:
        base += (
            "\nMode conversation : l'utilisateur demande une modification ciblée. "
            "Mets à jour le menu via `generate_menu` si les plats changent, "
            "puis régénère courses/budget si besoin."
        )
    return base


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
                        f"[{model}] échec durable ({code}) — bascule auto vers {nxt}",
                        level="warn",
                    )
                    break

                raise

    assert last_exc is not None
    raise last_exc


def _append_chat(run_id: str, role: str, content: str) -> None:
    session = run_store.get_run(run_id)
    if session is None:
        return
    messages = list(session.messages)
    messages.append(ChatMessage(role=role, content=content, timestamp=_now()))  # type: ignore[arg-type]
    run_store.update_run(run_id, messages=messages)


def _menu_context_blob(menu: MenuPlan | None) -> str:
    if menu is None:
        return "(aucun menu encore)"
    return json.dumps(menu.model_dump(mode="json"), ensure_ascii=False, indent=2)


def _run_tool_loop(
    *,
    run_id: str,
    prompt: str,
    profile: UserProfile,
    contents: list[types.Content],
    menu: MenuPlan | None,
    require_menu: bool,
    follow_up: bool = False,
) -> None:
    settings = get_settings()
    model_chain = resolve_model_chain(profile)
    client = genai.Client(api_key=settings.gemini_api_key.strip())
    config = types.GenerateContentConfig(
        system_instruction=_system_instruction(profile, follow_up=follow_up),
        tools=agent_tools.tool_definitions(),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.55,
    )

    summary: str | None = None
    active_model = model_chain[0]
    max_rounds = max(1, settings.agent_max_tool_rounds)
    assistant_bits: list[str] = []

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
                assistant_bits.append(summary)
                run_store.append_log(
                    run_id,
                    f"Message modèle : {summary[:280]}{'…' if len(summary) > 280 else ''}",
                )

            if not function_calls:
                if require_menu and menu is None:
                    run_store.append_log(
                        run_id,
                        "Aucun appel d’outil — nudge generate_menu",
                        level="warn",
                    )
                    if round_idx < max_rounds:
                        contents.append(
                            types.Content(
                                role="user",
                                parts=[
                                    types.Part.from_text(
                                        text=(
                                            f"Appelle `{agent_tools.GENERATE_MENU_NAME}` "
                                            f"avec exactement {profile.recipe_days} jours, "
                                            "puis `build_shopping_list` et `estimate_budget`."
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
                run_store.append_log(run_id, f"Exécution outil `{name}`", tool=name)
                try:
                    menu, tool_result = agent_tools.dispatch_tool(
                        name,
                        raw_args,
                        prompt=prompt,
                        profile=profile,
                        menu=menu,
                    )
                    if menu is not None and name == agent_tools.GENERATE_MENU_NAME:
                        # Guarantee shopping/budget even if the model stalls next
                        if not menu.shopping_list or menu.budget is None:
                            menu = agent_tools.ensure_shopping_and_budget(menu, profile)
                            tool_result = {
                                **tool_result,
                                "shopping_auto": True,
                                "items_count": len(menu.shopping_list),
                                "estimated_total_eur": (
                                    menu.budget.estimated_total_eur if menu.budget else None
                                ),
                                "message": (
                                    f"{tool_result.get('message', 'Menu OK')} "
                                    "+ courses/budget auto"
                                ),
                            }
                    if menu is not None:
                        run_store.update_run(run_id, result=menu)
                    run_store.append_log(
                        run_id,
                        f"OK `{name}` — {tool_result.get('message', tool_result)}",
                        tool=name,
                        level="success" if tool_result.get("ok") else "warn",
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
                    types.Part.from_function_response(name=name, response=tool_result)
                )

            contents.append(types.Content(role="user", parts=function_response_parts))

            # Initial generation: stop once menu + shopping + budget exist
            if (
                menu is not None
                and menu.shopping_list
                and menu.budget is not None
            ):
                break

            if not follow_up and menu is not None and round_idx >= 2:
                # Avoid hanging forever waiting for shopping tools
                menu = agent_tools.ensure_shopping_and_budget(menu, profile)
                run_store.update_run(run_id, result=menu)
                run_store.append_log(
                    run_id,
                    "Courses/budget complétés automatiquement depuis les ingrédients",
                    level="success",
                )
                break

        if require_menu and menu is None:
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
            if assistant_bits:
                _append_chat(run_id, "assistant", "\n\n".join(assistant_bits))
            elif summary:
                _append_chat(run_id, "assistant", summary)
            else:
                _append_chat(
                    run_id,
                    "assistant",
                    "Menu / courses mis à jour." if menu else "Tour terminé.",
                )

            run_store.update_run(
                run_id,
                status="completed",
                result=menu,
                summary=summary,
                error=None,
            )
            run_store.append_log(
                run_id,
                f"Exécution terminée (modèle {active_model})",
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
        _append_chat(run_id, "assistant", f"Erreur : {exc}")

    final = run_store.get_run(run_id)
    if final:
        run_store.persist_latest(final)


def start_run(prompt: str) -> AgentSession:
    profile = profile_store.load_profile()
    session = AgentSession(
        id=str(uuid.uuid4()),
        status="pending",
        prompt=prompt.strip(),
        profile=profile,
        logs=[],
        messages=[
            ChatMessage(role="user", content=prompt.strip(), timestamp=_now()),
        ],
    )
    run_store.create_run(session)
    run_store.append_log(session.id, "Session créée — en attente d’exécution")
    run_store.append_log(
        session.id,
        (
            f"Profil : {profile.recipe_days}j · {profile.household_size} pers. · "
            f"budget {profile.weekly_budget_eur}€ · mode={profile.model_selection_mode.value} · "
            f"modèle={profile.preferred_model}"
        ),
    )
    return run_store.get_run(session.id) or session


def execute_run(run_id: str) -> None:
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
        run_store.append_log(run_id, "Échec : clé Gemini absente", level="error")
        failed = run_store.get_run(run_id)
        if failed:
            run_store.persist_latest(failed)
        return

    profile = profile_store.load_profile()
    model_chain = resolve_model_chain(profile)
    run_store.update_run(run_id, status="running", profile=profile)
    run_store.append_log(
        run_id,
        f"Chaîne modèles ({profile.model_selection_mode.value}) : " + " → ".join(model_chain),
    )

    contents: list[types.Content] = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=session.prompt)],
        )
    ]
    _run_tool_loop(
        run_id=run_id,
        prompt=session.prompt,
        profile=profile,
        contents=contents,
        menu=None,
        require_menu=True,
        follow_up=False,
    )


def execute_follow_up(run_id: str, message: str) -> None:
    session = run_store.get_run(run_id)
    if session is None:
        return

    settings = get_settings()
    if not settings.has_gemini:
        run_store.update_run(
            run_id,
            status="failed",
            error="GEMINI_API_KEY manquante",
        )
        run_store.append_log(run_id, "Échec : clé Gemini absente", level="error")
        return

    profile = profile_store.load_profile()
    cleaned = message.strip()
    _append_chat(run_id, "user", cleaned)
    run_store.update_run(run_id, status="running", profile=profile, error=None)
    run_store.append_log(run_id, f"Follow-up utilisateur : {cleaned[:200]}")

    context = (
        f"Consigne initiale : {session.prompt}\n\n"
        f"Menu / courses actuels (JSON) :\n{_menu_context_blob(session.result)}\n\n"
        f"Demande de modification : {cleaned}"
    )
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part.from_text(text=context)])
    ]
    _run_tool_loop(
        run_id=run_id,
        prompt=session.prompt,
        profile=profile,
        contents=contents,
        menu=session.result,
        require_menu=False,
        follow_up=True,
    )
