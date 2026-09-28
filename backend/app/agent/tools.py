"""Tool declarations and local executors for Gemini Function Calling."""

from __future__ import annotations

from typing import Any

from google.genai import types

from app.models.schemas import DayMeal, MenuPlan, Recipe, UserProfile

GENERATE_MENU_NAME = "generate_menu"

GENERATE_MENU_DECLARATION = types.FunctionDeclaration(
    name=GENERATE_MENU_NAME,
    description=(
        "Enregistre un menu hebdomadaire structuré (7 jours) avec fiches recettes. "
        "À appeler une fois le menu finalisé, en respectant le profil utilisateur "
        "(personnes, budget, régimes, notes)."
    ),
    parameters_json_schema={
        "type": "object",
        "properties": {
            "days": {
                "type": "array",
                "description": "Planning des repas de la semaine (idéalement 7 jours).",
                "items": {
                    "type": "object",
                    "properties": {
                        "day": {
                            "type": "string",
                            "description": "Jour (ex. Lundi)",
                        },
                        "meal_type": {
                            "type": "string",
                            "description": "Type de repas (lunch, dinner, …)",
                            "default": "dinner",
                        },
                        "recipe_title": {
                            "type": "string",
                            "description": "Titre de la recette prévue ce jour",
                        },
                        "notes": {
                            "type": "string",
                            "description": "Notes optionnelles pour le jour",
                        },
                    },
                    "required": ["day", "recipe_title"],
                },
            },
            "recipes": {
                "type": "array",
                "description": "Fiches recettes détaillées référencées par le planning.",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "servings": {
                            "type": "integer",
                            "description": "Nombre de portions",
                        },
                        "steps": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Étapes de préparation",
                        },
                    },
                    "required": ["title", "steps"],
                },
            },
        },
        "required": ["days", "recipes"],
    },
)


def tool_definitions() -> list[types.Tool]:
    return [types.Tool(function_declarations=[GENERATE_MENU_DECLARATION])]


def execute_generate_menu(
    args: dict[str, Any],
    *,
    prompt: str,
    profile: UserProfile,
) -> tuple[MenuPlan, dict[str, Any]]:
    """Validate tool args into a MenuPlan and return (plan, tool_response)."""
    days_raw = args.get("days") or []
    recipes_raw = args.get("recipes") or []

    days = [DayMeal.model_validate(item) for item in days_raw]
    recipes: list[Recipe] = []
    for item in recipes_raw:
        recipe = Recipe.model_validate(item)
        if recipe.servings <= 0:
            recipe.servings = profile.household_size
        recipes.append(recipe)

    if not days:
        raise ValueError("Le menu doit contenir au moins un jour")
    if not recipes:
        raise ValueError("Le menu doit contenir au moins une recette")

    plan = MenuPlan(prompt=prompt, days=days, recipes=recipes)
    response = {
        "ok": True,
        "days_count": len(plan.days),
        "recipes_count": len(plan.recipes),
        "message": "Menu enregistré avec succès",
    }
    return plan, response
