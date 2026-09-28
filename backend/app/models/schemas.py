"""Core domain schemas."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


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
    recipe_days: Literal[3, 5, 7] = 5
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
    name: str
    quantity: str = "1"
    aisle: str = "Divers"
    estimated_price_eur: float | None = None


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
    youtube_video_id: str | None = None
    youtube_url: str | None = None


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


class AgentSession(BaseModel):
    id: str
    status: str = "pending"  # pending | running | completed | failed
    prompt: str
    profile: UserProfile | None = None
    result: MenuPlan | None = None
    keep: KeepSyncStatus | None = None
    logs: list[AgentLogEvent] = Field(default_factory=list)
    messages: list[ChatMessage] = Field(default_factory=list)
    error: str | None = None
    summary: str | None = None
