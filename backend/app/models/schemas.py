"""Core domain schemas."""

from __future__ import annotations

import re
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


class DietaryRegime(str, Enum):
    OMNIVORE = "omnivore"
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"
    GLUTEN_FREE = "gluten_free"
    HALAL = "halal"
    OTHER = "other"


class ModelSelectionMode(str, Enum):
    MANUAL = "manual"
    AUTO = "auto"


class IntegrationStatus(BaseModel):
    gemini: bool = False
    youtube: bool = False
    google_keep: bool = False


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    integrations: IntegrationStatus


class UserProfile(BaseModel):
    """User preferences (mono-utilisateur)."""

    household_size: int = Field(default=2, ge=1, le=12)
    budget_eur: float = Field(
        default=80.0,
        ge=0,
        description="Budget global pour la période de recettes (recipe_days)",
    )
    recipe_days: int = Field(default=5, ge=1, le=14)
    dietary_regimes: list[DietaryRegime] = Field(
        default_factory=lambda: [DietaryRegime.OMNIVORE],
        min_length=1,
    )
    notes: str = Field(default="", max_length=500)
    model_selection_mode: ModelSelectionMode = ModelSelectionMode.AUTO
    preferred_model: str = Field(
        default="gemini-3.5-flash-lite",
        min_length=1,
        max_length=80,
    )

    @model_validator(mode="before")
    @classmethod
    def migrate_weekly_budget(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        if payload.get("budget_eur") is None and payload.get("weekly_budget_eur") is not None:
            payload["budget_eur"] = payload["weekly_budget_eur"]
        return payload

    @field_validator("dietary_regimes")
    @classmethod
    def unique_regimes(cls, value: list[DietaryRegime]) -> list[DietaryRegime]:
        seen: set[DietaryRegime] = set()
        unique: list[DietaryRegime] = []
        for regime in value:
            if regime not in seen:
                seen.add(regime)
                unique.append(regime)
        if not unique:
            raise ValueError("Au moins un régime alimentaire est requis")
        return unique

    @field_validator("preferred_model")
    @classmethod
    def strip_preferred_model(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("preferred_model ne peut pas être vide")
        return cleaned

    @property
    def budget_per_day_eur(self) -> float:
        return round(self.budget_eur / max(1, self.recipe_days), 2)


class ShoppingItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    quantity_g: float = Field(
        default=0,
        ge=0,
        description="Quantité en grammes (référence d'affichage et de pricing)",
    )
    quantity: str = Field(
        default="",
        description="Libellé affichable, ex. '500 g' ou '6 œufs (~360 g)'",
    )
    unit: Literal["g", "unit"] = "g"
    unit_count: float | None = Field(
        default=None,
        description="Nombre d'unités si unit=unit (ex. œufs)",
    )
    aisle: str = "Divers"
    unit_price_eur: float | None = Field(
        default=None,
        description="Prix unitaire estimé (€/kg si unit=g, sinon €/unité)",
    )
    estimated_price_eur: float | None = Field(
        default=None,
        description="Prix total estimé pour la quantité de la ligne",
    )
    price_source: Literal["gemini", "heuristic", "override"] | None = None
    checked: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_quantity_and_id(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        raw_id = str(payload.get("id") or "").strip()
        if not raw_id:
            name = str(payload.get("name") or "item").strip().lower()
            aisle = str(payload.get("aisle") or "divers").strip().lower()
            payload["id"] = f"{aisle}::{name}"
        if "checked" in payload and isinstance(payload["checked"], str):
            payload["checked"] = payload["checked"].lower() in {"1", "true", "yes"}

        qty_g = payload.get("quantity_g")
        qty_label = str(payload.get("quantity") or "").strip()
        if qty_g is None or qty_g == "" or float(qty_g or 0) <= 0:
            # Parse "500 g", "500g", "0.5 kg", plain numbers
            parsed = _parse_grams_from_label(qty_label)
            if parsed is not None:
                payload["quantity_g"] = parsed
            else:
                payload["quantity_g"] = 100.0
        else:
            payload["quantity_g"] = float(qty_g)

        if not qty_label:
            g = float(payload["quantity_g"])
            payload["quantity"] = (
                f"{int(g)} g" if abs(g - int(g)) < 1e-6 else f"{g:g} g"
            )
        return payload


def _parse_grams_from_label(label: str) -> float | None:
    if not label:
        return None
    text = label.lower().replace(",", ".")
    kg = re.search(r"(\d+(?:\.\d+)?)\s*kg", text)
    if kg:
        return float(kg.group(1)) * 1000.0
    grams = re.search(r"(\d+(?:\.\d+)?)\s*g\b", text)
    if grams:
        return float(grams.group(1))
    ml = re.search(r"(\d+(?:\.\d+)?)\s*ml\b", text)
    if ml:
        return float(ml.group(1))  # approx 1 ml ≈ 1 g for pricing
    plain = re.fullmatch(r"(\d+(?:\.\d+)?)", text.strip())
    if plain:
        return float(plain.group(1))
    return None


class Ingredient(BaseModel):
    """Structured recipe ingredient with gram-first quantity."""

    name: str
    quantity_g: float = Field(default=100.0, ge=0)
    quantity_label: str = ""

    @model_validator(mode="before")
    @classmethod
    def coerce_from_string(cls, data: object) -> object:
        if isinstance(data, str):
            raw = data.strip()
            if "—" in raw:
                name, _, rest = raw.partition("—")
            elif " - " in raw:
                name, _, rest = raw.partition(" - ")
            else:
                parts = raw.rsplit(" ", 1)
                if len(parts) == 2 and any(ch.isdigit() for ch in parts[1]):
                    name, rest = parts[0], parts[1]
                else:
                    name, rest = raw, ""
            payload = {
                "name": name.strip() or raw,
                "quantity_label": rest.strip() or raw,
            }
            parsed = _parse_grams_from_label(rest.strip())
            if parsed is not None:
                payload["quantity_g"] = parsed
            return payload
        if isinstance(data, dict):
            payload = dict(data)
            if not payload.get("quantity_label") and payload.get("quantity_g") is not None:
                g = float(payload["quantity_g"])
                payload["quantity_label"] = (
                    f"{int(g)} g" if abs(g - int(g)) < 1e-6 else f"{g:g} g"
                )
            if payload.get("quantity_g") is None and payload.get("quantity_label"):
                parsed = _parse_grams_from_label(str(payload["quantity_label"]))
                if parsed is not None:
                    payload["quantity_g"] = parsed
            return payload
        return data

    @model_validator(mode="after")
    def ensure_label(self) -> Ingredient:
        if not self.quantity_label.strip():
            g = self.quantity_g
            object.__setattr__(
                self,
                "quantity_label",
                f"{int(g)} g" if abs(g - int(g)) < 1e-6 else f"{g:g} g",
            )
        return self


class BudgetReport(BaseModel):
    estimated_total_eur: float
    budget_eur: float = Field(description="Budget global pour la période de recettes")
    recipe_days: int = Field(default=1, ge=1, le=14)
    budget_per_day_eur: float = 0.0
    delta_eur: float
    within_budget: bool
    currency: str = "EUR"
    # Compat lecture anciennes sessions / clients
    weekly_budget_eur: float | None = None

    @model_validator(mode="before")
    @classmethod
    def migrate_and_derive(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        if payload.get("budget_eur") is None and payload.get("weekly_budget_eur") is not None:
            payload["budget_eur"] = payload["weekly_budget_eur"]
        days = max(1, int(payload.get("recipe_days") or 1))
        payload["recipe_days"] = days
        budget = payload.get("budget_eur")
        if budget is not None:
            budget_f = float(budget)
            payload["budget_eur"] = budget_f
            if payload.get("budget_per_day_eur") is None:
                payload["budget_per_day_eur"] = round(budget_f / days, 2)
            if payload.get("weekly_budget_eur") is None:
                payload["weekly_budget_eur"] = budget_f
        return payload


class Recipe(BaseModel):
    title: str
    servings: int = 2
    steps: list[str] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)
    prep_time_minutes: int = Field(
        default=20,
        ge=1,
        le=480,
        description="Temps de préparation estimé en minutes",
    )
    youtube_video_id: str | None = None
    youtube_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def coerce_prep_time(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        raw = payload.get("prep_time_minutes")
        if raw is None:
            for key in (
                "prep_time",
                "preparation_time",
                "preparation_minutes",
                "temps_preparation",
                "temps",
                "duree",
                "duration_minutes",
            ):
                if payload.get(key) is not None:
                    raw = payload[key]
                    break
        if isinstance(raw, str):
            digits = "".join(ch for ch in raw if ch.isdigit())
            raw = int(digits) if digits else None
        if isinstance(raw, (int, float)) and raw > 0:
            payload["prep_time_minutes"] = max(1, min(480, int(raw)))
        elif payload.get("prep_time_minutes") is None:
            steps = payload.get("steps") or []
            # Heuristic: ~4 min per step, bounded
            estimate = max(10, min(90, len(steps) * 4 or 15))
            payload["prep_time_minutes"] = estimate
        return payload


class DayMeal(BaseModel):
    day: str
    meal_type: str = "dinner"
    recipe_title: str
    notes: str = ""


class MenuPlan(BaseModel):
    prompt: str
    days: list[DayMeal] = Field(default_factory=list)
    recipes: list[Recipe] = Field(default_factory=list)
    shopping_list: list[ShoppingItem] = Field(default_factory=list)
    budget: BudgetReport | None = None


class KeepSyncStatus(BaseModel):
    synced: bool = False
    note_id: str | None = None
    note_title: str | None = None
    message: str = ""


class AgentLogEvent(BaseModel):
    level: str = "info"
    tool: str | None = None
    message: str
    timestamp: str | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: str | None = None


class AgentRunRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)


class AgentFollowUpRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=2000)


class ShoppingCheckUpdate(BaseModel):
    item_id: str
    checked: bool


class ShoppingBulkCheckUpdate(BaseModel):
    items: list[ShoppingCheckUpdate] = Field(default_factory=list)


class SessionRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Le titre ne peut pas être vide")
        return cleaned


class SessionSummary(BaseModel):
    id: str
    prompt: str
    status: str
    title: str = ""
    updated_at: str | None = None
    days_count: int = 0
    shopping_count: int = 0
    checked_count: int = 0
    estimated_total_eur: float | None = None


class AgentSession(BaseModel):
    id: str
    status: str = "pending"  # pending | running | completed | failed
    prompt: str
    title: str = ""
    updated_at: str | None = None
    profile: UserProfile | None = None
    result: MenuPlan | None = None
    keep: KeepSyncStatus | None = None
    logs: list[AgentLogEvent] = Field(default_factory=list)
    messages: list[ChatMessage] = Field(default_factory=list)
    error: str | None = None
    summary: str | None = None
    menu_validated: bool = False
