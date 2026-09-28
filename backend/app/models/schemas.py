"""Core domain schemas."""

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
    weekly_budget_eur: float = Field(default=80.0, ge=0)
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


class ShoppingItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    quantity: str = "1"
    aisle: str = "Divers"
    estimated_price_eur: float | None = None
    checked: bool = False

    @model_validator(mode="before")
    @classmethod
    def ensure_stable_id(cls, data: object) -> object:
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
        return payload


class BudgetReport(BaseModel):
    estimated_total_eur: float
    weekly_budget_eur: float
    delta_eur: float
    within_budget: bool
    currency: str = "EUR"


class Recipe(BaseModel):
    title: str
    servings: int = 2
    steps: list[str] = Field(default_factory=list)
    ingredients: list[str] = Field(default_factory=list)
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
