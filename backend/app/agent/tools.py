"""Tool declarations and local executors for Gemini Function Calling."""

from __future__ import annotations

from typing import Any

from google.genai import types

from app.core.pricing import price_shopping_list
from app.models.schemas import (
    DayMeal,
    MenuPlan,
    Recipe,
    ShoppingItem,
    UserProfile,
)

GENERATE_MENU_NAME = "generate_menu"
BUILD_SHOPPING_LIST_NAME = "build_shopping_list"
ESTIMATE_BUDGET_NAME = "estimate_budget"

GENERATE_MENU_DECLARATION = types.FunctionDeclaration(
    name=GENERATE_MENU_NAME,
    description=(
        "Enregistre ou remplace le menu structuré (planning + recettes avec ingrédients). "
        "Respecte le nombre de jours demandé dans le profil."
    ),
    parameters_json_schema={
        "type": "object",
        "properties": {
            "days": {
                "type": "array",
                "description": "Planning des repas (autant de jours que demandé).",
                "items": {
                    "type": "object",
                    "properties": {
                        "day": {"type": "string"},
                        "meal_type": {"type": "string", "default": "dinner"},
                        "recipe_title": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                    "required": ["day", "recipe_title"],
                },
            },
            "recipes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "servings": {"type": "integer"},
                        "prep_time_minutes": {
                            "type": "integer",
                            "description": "Temps de préparation estimé en minutes",
                        },
                        "steps": {"type": "array", "items": {"type": "string"}},
                        "ingredients": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Ingrédients avec quantités approximatives",
                        },
                    },
                    "required": ["title", "steps", "ingredients", "prep_time_minutes"],
                },
            },
        },
        "required": ["days", "recipes"],
    },
)

BUILD_SHOPPING_LIST_DECLARATION = types.FunctionDeclaration(
    name=BUILD_SHOPPING_LIST_NAME,
    description=(
        "Construit la liste de courses groupée par rayon à partir du menu. "
        "À appeler après generate_menu ou après une modification du menu."
    ),
    parameters_json_schema={
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "quantity": {"type": "string"},
                        "aisle": {
                            "type": "string",
                            "description": (
                                "Rayon: Fruits & Légumes, Viandes & Poissons, "
                                "Produits laitiers, Épicerie, Boulangerie, Surgelés, "
                                "Boissons, Divers"
                            ),
                        },
                    },
                    "required": ["name", "quantity", "aisle"],
                },
            },
        },
        "required": ["items"],
    },
)

ESTIMATE_BUDGET_DECLARATION = types.FunctionDeclaration(
    name=ESTIMATE_BUDGET_NAME,
    description=(
        "Estime le coût de la liste de courses courante et compare au budget profil. "
        "Optionnellement ajuste des prix unitaires."
    ),
    parameters_json_schema={
        "type": "object",
        "properties": {
            "price_overrides": {
                "type": "object",
                "description": "Map nom d'article -> prix EUR unitaire (optionnel)",
                "additionalProperties": {"type": "number"},
            },
        },
    },
)


def tool_definitions() -> list[types.Tool]:
    return [
        types.Tool(
            function_declarations=[
                GENERATE_MENU_DECLARATION,
                BUILD_SHOPPING_LIST_DECLARATION,
                ESTIMATE_BUDGET_DECLARATION,
            ]
        )
    ]


def execute_generate_menu(
    args: dict[str, Any],
    *,
    prompt: str,
    profile: UserProfile,
    previous: MenuPlan | None = None,
) -> tuple[MenuPlan, dict[str, Any]]:
    days = [DayMeal.model_validate(item) for item in (args.get("days") or [])]
    recipes: list[Recipe] = []
    for item in args.get("recipes") or []:
        recipe = Recipe.model_validate(item)
        if recipe.servings <= 0:
            recipe.servings = profile.household_size
        recipes.append(recipe)

    if not days:
        raise ValueError("Le menu doit contenir au moins un jour")
    if not recipes:
        raise ValueError("Le menu doit contenir au moins une recette")
    if len(days) != profile.recipe_days:
        raise ValueError(
            f"Le profil demande {profile.recipe_days} jour(s), reçu {len(days)}"
        )

    plan = MenuPlan(
        prompt=prompt,
        days=days,
        recipes=recipes,
        shopping_list=previous.shopping_list if previous else [],
        budget=previous.budget if previous else None,
    )
    return plan, {
        "ok": True,
        "days_count": len(plan.days),
        "recipes_count": len(plan.recipes),
        "expected_days": profile.recipe_days,
        "message": "Menu enregistré avec succès",
    }


def execute_build_shopping_list(
    args: dict[str, Any],
    *,
    menu: MenuPlan,
    profile: UserProfile,
) -> tuple[MenuPlan, dict[str, Any]]:
    raw_items = args.get("items") or []
    if not raw_items:
        raise ValueError("La liste de courses ne peut pas être vide")

    items = [ShoppingItem.model_validate(item) for item in raw_items]
    priced, budget = price_shopping_list(items, profile)
    updated = menu.model_copy(update={"shopping_list": priced, "budget": budget})
    return updated, {
        "ok": True,
        "items_count": len(priced),
        "estimated_total_eur": budget.estimated_total_eur,
        "within_budget": budget.within_budget,
        "message": "Liste de courses générée et estimée",
    }


def execute_estimate_budget(
    args: dict[str, Any],
    *,
    menu: MenuPlan,
    profile: UserProfile,
) -> tuple[MenuPlan, dict[str, Any]]:
    if not menu.shopping_list:
        raise ValueError("Aucune liste de courses — appelez build_shopping_list d'abord")

    overrides = args.get("price_overrides") or {}
    items: list[ShoppingItem] = []
    for item in menu.shopping_list:
        override = None
        for key, value in overrides.items():
            if key.lower() in item.name.lower() or item.name.lower() in key.lower():
                override = float(value)
                break
        if override is not None:
            items.append(item.model_copy(update={"estimated_price_eur": override}))
        else:
            items.append(item)

    priced, budget = price_shopping_list(items, profile)
    updated = menu.model_copy(update={"shopping_list": priced, "budget": budget})
    return updated, {
        "ok": True,
        "estimated_total_eur": budget.estimated_total_eur,
        "weekly_budget_eur": budget.weekly_budget_eur,
        "delta_eur": budget.delta_eur,
        "within_budget": budget.within_budget,
        "message": (
            "Budget respecté"
            if budget.within_budget
            else f"Dépassement de {budget.delta_eur} €"
        ),
    }


def _guess_aisle(name: str) -> str:
    key = name.lower()
    if any(w in key for w in ("poulet", "boeuf", "porc", "thon", "saumon", "poisson", "viande")):
        return "Viandes & Poissons"
    if any(w in key for w in ("lait", "fromage", "yaourt", "beurre", "oeuf", "œuf")):
        return "Produits laitiers"
    if any(
        w in key
        for w in (
            "tomate",
            "oignon",
            "ail",
            "carotte",
            "salade",
            "épinard",
            "courgette",
            "poivron",
            "fruit",
            "légume",
        )
    ):
        return "Fruits & Légumes"
    if any(w in key for w in ("pain", "baguette")):
        return "Boulangerie"
    if any(w in key for w in ("eau", "jus", "soda", "boisson")):
        return "Boissons"
    return "Épicerie"


def ensure_shopping_and_budget(
    menu: MenuPlan,
    profile: UserProfile,
) -> MenuPlan:
    """Deterministic fallback: derive courses + budget from recipe ingredients."""
    if menu.shopping_list and menu.budget is not None:
        return menu

    if not menu.shopping_list:
        aggregated: dict[str, ShoppingItem] = {}
        for recipe in menu.recipes:
            for raw in recipe.ingredients:
                name = raw.strip()
                if not name:
                    continue
                key = name.lower()
                if key in aggregated:
                    continue
                aggregated[key] = ShoppingItem(
                    name=name,
                    quantity="1",
                    aisle=_guess_aisle(name),
                )
        items = list(aggregated.values())
        if not items:
            items = [
                ShoppingItem(name=recipe.title, quantity="1", aisle="Divers")
                for recipe in menu.recipes
            ]
        priced, budget = price_shopping_list(items, profile)
        return menu.model_copy(update={"shopping_list": priced, "budget": budget})

    priced, budget = price_shopping_list(menu.shopping_list, profile)
    return menu.model_copy(update={"shopping_list": priced, "budget": budget})


def dispatch_tool(
    name: str,
    args: dict[str, Any],
    *,
    prompt: str,
    profile: UserProfile,
    menu: MenuPlan | None,
) -> tuple[MenuPlan | None, dict[str, Any]]:
    if name == GENERATE_MENU_NAME:
        return execute_generate_menu(
            args, prompt=prompt, profile=profile, previous=menu
        )
    if name == BUILD_SHOPPING_LIST_NAME:
        if menu is None:
            raise ValueError("Aucun menu en session — générez un menu d'abord")
        return execute_build_shopping_list(args, menu=menu, profile=profile)
    if name == ESTIMATE_BUDGET_NAME:
        if menu is None:
            raise ValueError("Aucun menu en session — générez un menu d'abord")
        return execute_estimate_budget(args, menu=menu, profile=profile)
    return menu, {"ok": False, "error": f"Outil inconnu: {name}"}
