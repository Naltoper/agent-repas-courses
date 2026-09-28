"""Catalog of Gemini 3.x models exposed to the UI and orchestrator."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.models.schemas import ModelSelectionMode, UserProfile


class GeminiModelInfo(BaseModel):
    id: str
    label: str
    description: str = ""
    recommended: bool = False


class GeminiModelsResponse(BaseModel):
    models: list[GeminiModelInfo]
    default_model: str
    fallback_models: list[str] = Field(default_factory=list)


# Ordered catalog shown in the profile select (série 3.x only).
AVAILABLE_MODELS: list[GeminiModelInfo] = [
    GeminiModelInfo(
        id="gemini-3.5-flash-lite",
        label="Gemini 3.5 Flash-Lite",
        description="Rapide, économique — recommandé free tier / agents.",
        recommended=True,
    ),
    GeminiModelInfo(
        id="gemini-3.5-flash",
        label="Gemini 3.5 Flash",
        description="Meilleure qualité agentique ; quota free tier plus serré.",
    ),
    GeminiModelInfo(
        id="gemini-3.6-flash",
        label="Gemini 3.6 Flash",
        description="Bon équilibre qualité / coût sur la série 3.6.",
    ),
    GeminiModelInfo(
        id="gemini-3.1-flash-lite",
        label="Gemini 3.1 Flash-Lite",
        description="Alternative lite (secours).",
    ),
    GeminiModelInfo(
        id="gemini-3.8-flash",
        label="Gemini 3.8 Flash",
        description="Flash le plus capable — plus coûteux / sujet aux quotas.",
    ),
]

# Fallback chain when model_selection_mode == auto (preferred tried first).
DEFAULT_FALLBACK_ORDER: list[str] = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
]


def known_model_ids() -> set[str]:
    return {m.id for m in AVAILABLE_MODELS}


def list_models_response() -> GeminiModelsResponse:
    settings = get_settings()
    fallback = [
        m.strip()
        for m in settings.gemini_fallback_models.split(",")
        if m.strip()
    ] or DEFAULT_FALLBACK_ORDER
    return GeminiModelsResponse(
        models=AVAILABLE_MODELS,
        default_model=settings.gemini_model,
        fallback_models=fallback,
    )


def resolve_model_chain(profile: UserProfile) -> list[str]:
    """Build the ordered list of models to try for a given profile."""
    settings = get_settings()
    preferred = (profile.preferred_model or settings.gemini_model).strip()
    if not preferred:
        preferred = DEFAULT_FALLBACK_ORDER[0]

    if profile.model_selection_mode == ModelSelectionMode.MANUAL:
        return [preferred]

    configured = [
        m.strip()
        for m in settings.gemini_fallback_models.split(",")
        if m.strip()
    ] or DEFAULT_FALLBACK_ORDER

    chain: list[str] = []
    for model_id in [preferred, *configured]:
        if model_id not in chain:
            chain.append(model_id)
    return chain
