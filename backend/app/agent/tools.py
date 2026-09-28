"""Tool declarations and local executors for Gemini Function Calling."""

from __future__ import annotations

from typing import Any

from google.genai import types

from app.core.pricing import price_shopping_list
from app.models.schemas import (
    DayMeal,
    Ingredient,
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
        "Respecte le nombre de jours demandé dans le profil. "
        "Chaque ingrédient DOIT avoir une quantité en grammes."
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
                            "description": (
                                "Temps de préparation réaliste en minutes "
                                "(ex. 15, 25, 40 — obligatoire)"
                            ),
                            "minimum": 5,
                            "maximum": 180,
                        },
                        "steps": {"type": "array", "items": {"type": "string"}},
                        "ingredients": {
                            "type": "array",
                            "description": (
                                "Ingrédients structurés avec quantité en grammes "
                                "(prioritaire). Pour les unités (œufs), renseigner "
                                "aussi quantity_label ex. '6 œufs (~360 g)'."
                            ),
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "quantity_g": {
                                        "type": "number",
                                        "description": "Quantité en grammes",
                                        "minimum": 1,
                                    },
                                    "quantity_label": {
                                        "type": "string",
                                        "description": "Ex. '400 g' ou '6 œufs (~360 g)'",
                                    },
                                },
                                "required": ["name", "quantity_g"],
                            },
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
        "Construit la liste de courses agrégée par rayon à partir du menu. "
        "Chaque article DOIT avoir quantity_g (grammes) et un libellé quantity. "
        "Agrège les mêmes produits en additionnant les grammes."
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
                        "quantity_g": {
                            "type": "number",
                            "description": "Quantité totale en grammes",
                            "minimum": 1,
                        },
                        "quantity": {
                            "type": "string",
                            "description": "Libellé affichable, ex. '500 g'",
                        },
                        "aisle": {
                            "type": "string",
                            "description": (
                                "Rayon: Fruits & Légumes, Viandes & Poissons, "
                                "Produits laitiers, Épicerie, Boulangerie, Surgelés, "
                                "Boissons, Divers"
                            ),
                        },
                    },
                    "required": ["name", "quantity_g", "aisle"],
                },
            },
        },
        "required": ["items"],
    },
)

ESTIMATE_BUDGET_DECLARATION = types.FunctionDeclaration(
    name=ESTIMATE_BUDGET_NAME,
    description=(
        "Estime dynamiquement le prix de CHAQUE article de la liste de courses "
        "selon sa quantité réelle en grammes (prix magasin France approximatif). "
        "Ne pas utiliser un prix fixe indépendant de la quantité : "
        "500 g de poulet ≠ 200 g. Puis compare au budget profil."
    ),
    parameters_json_schema={
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "description": "Prix estimés par l'IA pour chaque ligne (même noms que la liste).",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "quantity_g": {
                            "type": "number",
                            "description": "Quantité en grammes (doit coller à la liste)",
                        },
                        "unit_price_per_kg_eur": {
                            "type": "number",
                            "description": "Prix estimé au kg (€/kg)",
                            "minimum": 0,
                        },
                        "estimated_price_eur": {
                            "type": "number",
                            "description": (
                                "Prix TOTAL pour quantity_g "
                                "(≈ unit_price_per_kg_eur × quantity_g / 1000)"
                            ),
                            "minimum": 0,
                        },
                    },
                    "required": ["name", "quantity_g", "estimated_price_eur"],
                },
            },
        },
        "required": ["items"],
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
        if recipe.prep_time_minutes <= 0:
            estimate = max(10, min(90, len(recipe.steps) * 4 or 20))
            recipe = recipe.model_copy(update={"prep_time_minutes": estimate})
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


def _merge_checked_state(
    items: list[ShoppingItem],
    previous: list[ShoppingItem],
) -> list[ShoppingItem]:
    """Preserve checked flags / ids when regenerating a shopping list."""
    by_name = {item.name.strip().lower(): item for item in previous}
    merged: list[ShoppingItem] = []
    for item in items:
        prior = by_name.get(item.name.strip().lower())
        if prior is None:
            merged.append(item)
            continue
        updates: dict[str, Any] = {"id": prior.id, "checked": prior.checked}
        if item.estimated_price_eur is None and prior.estimated_price_eur is not None:
            updates["estimated_price_eur"] = prior.estimated_price_eur
            updates["unit_price_eur"] = prior.unit_price_eur
            updates["price_source"] = prior.price_source
        merged.append(item.model_copy(update=updates))
    return merged


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
    items = _merge_checked_state(items, menu.shopping_list)
    # Do not force heuristic yet if estimate_budget will price — but keep provisional totals
    priced, budget = price_shopping_list(items, profile, fill_missing_only=True)
    updated = menu.model_copy(update={"shopping_list": priced, "budget": budget})
    return updated, {
        "ok": True,
        "items_count": len(priced),
        "estimated_total_eur": budget.estimated_total_eur,
        "within_budget": budget.within_budget,
        "message": "Liste de courses générée (prix provisoires — estimez via estimate_budget)",
    }


def execute_estimate_budget(
    args: dict[str, Any],
    *,
    menu: MenuPlan,
    profile: UserProfile,
) -> tuple[MenuPlan, dict[str, Any]]:
    if not menu.shopping_list:
        raise ValueError("Aucune liste de courses — appelez build_shopping_list d'abord")

    gemini_items = args.get("items") or []
    by_name: dict[str, dict[str, Any]] = {}
    for raw in gemini_items:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip().lower()
        if not name:
            continue
        by_name[name] = raw

    # Legacy overrides map still accepted
    overrides = args.get("price_overrides") or {}

    items: list[ShoppingItem] = []
    for item in menu.shopping_list:
        key = item.name.strip().lower()
        raw = by_name.get(key)
        if raw is None:
            # fuzzy: substring match
            for cand_name, cand in by_name.items():
                if cand_name in key or key in cand_name:
                    raw = cand
                    break

        if raw is not None:
            total = float(raw.get("estimated_price_eur"))
            per_kg = raw.get("unit_price_per_kg_eur")
            qty_g = raw.get("quantity_g")
            updates: dict[str, Any] = {
                "estimated_price_eur": round(total, 2),
                "price_source": "gemini",
            }
            if per_kg is not None:
                updates["unit_price_eur"] = round(float(per_kg), 2)
            elif item.quantity_g > 0:
                updates["unit_price_eur"] = round(total / (item.quantity_g / 1000.0), 2)
            if qty_g is not None and float(qty_g) > 0:
                updates["quantity_g"] = float(qty_g)
                g = float(qty_g)
                updates["quantity"] = (
                    f"{int(g)} g" if abs(g - int(g)) < 1e-6 else f"{g:g} g"
                )
            items.append(item.model_copy(update=updates))
            continue

        override = None
        for okey, value in overrides.items():
            if okey.lower() in item.name.lower() or item.name.lower() in okey.lower():
                override = float(value)
                break
        if override is not None:
            items.append(
                item.model_copy(
                    update={
                        "estimated_price_eur": round(override, 2),
                        "price_source": "override",
                    }
                )
            )
        else:
            # leave for heuristic fill
            items.append(item.model_copy(update={"estimated_price_eur": None}))

    priced, budget = price_shopping_list(items, profile, fill_missing_only=True)
    updated = menu.model_copy(update={"shopping_list": priced, "budget": budget})
    gemini_count = sum(1 for i in priced if i.price_source == "gemini")
    return updated, {
        "ok": True,
        "estimated_total_eur": budget.estimated_total_eur,
        "budget_eur": budget.budget_eur,
        "recipe_days": budget.recipe_days,
        "budget_per_day_eur": budget.budget_per_day_eur,
        "delta_eur": budget.delta_eur,
        "within_budget": budget.within_budget,
        "gemini_priced_count": gemini_count,
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


def _ingredient_to_shopping(ing: Ingredient | str) -> ShoppingItem:
    if isinstance(ing, str):
        ing = Ingredient.model_validate(ing)
    return ShoppingItem(
        name=ing.name,
        quantity_g=ing.quantity_g,
        quantity=ing.quantity_label or f"{ing.quantity_g:g} g",
        aisle=_guess_aisle(ing.name),
    )


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
                item = _ingredient_to_shopping(raw)
                key = item.name.strip().lower()
                if key in aggregated:
                    prev = aggregated[key]
                    new_g = prev.quantity_g + item.quantity_g
                    aggregated[key] = prev.model_copy(
                        update={
                            "quantity_g": new_g,
                            "quantity": (
                                f"{int(new_g)} g"
                                if abs(new_g - int(new_g)) < 1e-6
                                else f"{new_g:g} g"
                            ),
                        }
                    )
                else:
                    aggregated[key] = item
        items = list(aggregated.values())
        if not items:
            items = [
                ShoppingItem(
                    name=recipe.title,
                    quantity_g=500,
                    quantity="500 g",
                    aisle="Divers",
                )
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
