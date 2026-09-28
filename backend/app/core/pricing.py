"""Grocery pricing: prefer Gemini line totals, heuristic fallback scaled by grams."""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from app.models.schemas import BudgetReport, ShoppingItem, UserProfile

PRICES_PATH = Path(__file__).resolve().parent.parent / "resources" / "prices.json"


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text)


@lru_cache
def _load_prices() -> dict:
    if not PRICES_PATH.exists():
        return {
            "default_unit_price_eur": 2.5,
            "aisle_defaults": {"Divers": 2.5},
            "items": {},
        }
    return json.loads(PRICES_PATH.read_text(encoding="utf-8"))


def estimate_price_per_kg(name: str, aisle: str = "Divers") -> float:
    """Heuristic €/kg (catalog values treated as per-kg references)."""
    data = _load_prices()
    items: dict[str, float] = data.get("items") or {}
    key = _normalize(name)
    if key in items:
        return float(items[key])
    for catalog_key, price in items.items():
        if catalog_key in key or key in catalog_key:
            return float(price)
    aisle_defaults: dict[str, float] = data.get("aisle_defaults") or {}
    if aisle in aisle_defaults:
        return float(aisle_defaults[aisle])
    return float(data.get("default_unit_price_eur", 2.5))


def estimate_item_price(name: str, aisle: str = "Divers") -> float:
    """Backward-compatible alias (heuristic €/kg)."""
    return estimate_price_per_kg(name, aisle)


def period_budget_eur(profile: UserProfile) -> tuple[float, int, float]:
    """Return (global budget for recipe period, days, per-day amount)."""
    days = max(1, profile.recipe_days)
    budget = float(profile.budget_eur)
    per_day = round(budget / days, 2)
    return budget, days, per_day


def _heuristic_line_total(item: ShoppingItem) -> tuple[float, float]:
    """Return (unit_price €/kg or €/unit, line total €) from local table."""
    qty_g = max(0.0, float(item.quantity_g or 0))
    if item.unit == "unit" and item.unit_count and item.unit_count > 0:
        per_unit = estimate_price_per_kg(item.name, item.aisle) / max(
            1.0, qty_g / max(item.unit_count, 1) / 100.0
        )
        # Simpler: catalog ≈ price per unit for unit items
        per_unit = estimate_price_per_kg(item.name, item.aisle)
        # For eggs catalog is 0.25 each — use as €/unit
        total = round(per_unit * float(item.unit_count), 2)
        return round(per_unit, 2), total

    per_kg = estimate_price_per_kg(item.name, item.aisle)
    # If quantity missing, assume 100 g
    grams = qty_g if qty_g > 0 else 100.0
    total = round(per_kg * (grams / 1000.0), 2)
    # Floor tiny lines
    if total < 0.05 and grams > 0:
        total = 0.05
    return round(per_kg, 2), total


def price_shopping_list(
    items: list[ShoppingItem],
    profile: UserProfile,
    *,
    fill_missing_only: bool = True,
) -> tuple[list[ShoppingItem], BudgetReport]:
    """
    Apply prices to shopping lines.

    - If Gemini (or override) already set estimated_price_eur, keep it.
    - Otherwise scale the local €/kg table by quantity_g.
    """
    priced: list[ShoppingItem] = []
    total = 0.0
    for item in items:
        source = item.price_source
        line_total = item.estimated_price_eur
        unit_price = item.unit_price_eur

        if fill_missing_only and line_total is not None and line_total >= 0:
            if source is None:
                source = "override" if unit_price is not None else "gemini"
            if unit_price is None and item.quantity_g > 0:
                unit_price = round(line_total / (item.quantity_g / 1000.0), 2)
            updated = item.model_copy(
                update={
                    "estimated_price_eur": round(float(line_total), 2),
                    "unit_price_eur": unit_price,
                    "price_source": source,
                }
            )
        else:
            per_kg, heuristic_total = _heuristic_line_total(item)
            updated = item.model_copy(
                update={
                    "unit_price_eur": per_kg,
                    "estimated_price_eur": heuristic_total,
                    "price_source": "heuristic",
                }
            )

        priced.append(updated)
        total += float(updated.estimated_price_eur or 0)

    total = round(total, 2)
    budget, days, per_day = period_budget_eur(profile)
    delta = round(total - budget, 2)
    report = BudgetReport(
        estimated_total_eur=total,
        budget_eur=budget,
        recipe_days=days,
        budget_per_day_eur=per_day,
        weekly_budget_eur=budget,
        delta_eur=delta,
        within_budget=total <= budget,
    )
    return priced, report
