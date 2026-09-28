"""Heuristic grocery pricing from local JSON table."""

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


def estimate_item_price(name: str, aisle: str = "Divers") -> float:
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


def price_shopping_list(
    items: list[ShoppingItem],
    profile: UserProfile,
) -> tuple[list[ShoppingItem], BudgetReport]:
    priced: list[ShoppingItem] = []
    total = 0.0
    for item in items:
        price = item.estimated_price_eur
        if price is None:
            price = estimate_item_price(item.name, item.aisle)
        priced.append(item.model_copy(update={"estimated_price_eur": round(price, 2)}))
        total += float(price)

    total = round(total, 2)
    budget = profile.weekly_budget_eur
    delta = round(total - budget, 2)
    report = BudgetReport(
        estimated_total_eur=total,
        weekly_budget_eur=budget,
        delta_eur=delta,
        within_budget=total <= budget,
    )
    return priced, report
