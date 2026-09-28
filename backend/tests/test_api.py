"""API smoke tests — validate, budget period, session rename/delete.

Run from backend/:
  DATA_DIR=/tmp/smartchef-tests PYTHONPATH=. python -m tests.test_api
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path


def _prepare_data_dir() -> Path:
    root = Path(tempfile.mkdtemp(prefix="smartchef-api-"))
    # Prefer workspace-local path when /tmp is restricted
    local = Path(__file__).resolve().parents[1] / "_test_data_run"
    if local.exists():
        shutil.rmtree(local, ignore_errors=True)
    try:
        local.mkdir(parents=True, exist_ok=True)
        shutil.rmtree(root, ignore_errors=True)
        root = local
    except OSError:
        pass
    os.environ["DATA_DIR"] = str(root)
    return root


def _run() -> None:
    data_dir = _prepare_data_dir()

    from fastapi.testclient import TestClient

    from app.core.config import reload_settings
    from app.core.pricing import price_shopping_list
    from app.main import create_app
    from app.models.schemas import (
        AgentSession,
        BudgetReport,
        DayMeal,
        MenuPlan,
        Recipe,
        ShoppingItem,
        UserProfile,
    )
    from app.storage import profile_store, run_store

    settings = reload_settings()
    assert settings.resolved_data_dir == data_dir.resolve() or settings.resolved_data_dir == data_dir, (
        f"DATA_DIR not applied: {settings.resolved_data_dir} vs {data_dir}"
    )

    run_store.clear_workspace()
    # Wipe leftover history from previous local runs
    sessions_dir = data_dir / "sessions"
    if sessions_dir.exists():
        shutil.rmtree(sessions_dir)
    index = data_dir / "sessions_index.json"
    if index.exists():
        index.unlink()

    app = create_app()
    client = TestClient(app)

    profile_store.save_profile(
        UserProfile(household_size=2, budget_eur=50, recipe_days=5)
    )
    session = AgentSession(
        id="sess-validate-1",
        status="completed",
        prompt="Menu test validation",
        title="Menu test",
        result=MenuPlan(
            prompt="Menu test validation",
            days=[DayMeal(day="Lundi", recipe_title="Soupe")],
            recipes=[
                Recipe(
                    title="Soupe",
                    steps=["couper", "mijoter"],
                    ingredients=["légumes"],
                )
            ],
            shopping_list=[
                ShoppingItem(
                    name="Carottes",
                    quantity="500 g",
                    aisle="Fruits & Légumes",
                )
            ],
            budget=BudgetReport(
                estimated_total_eur=12.0,
                budget_eur=50.0,
                recipe_days=5,
                budget_per_day_eur=10.0,
                delta_eur=-38.0,
                within_budget=True,
            ),
        ),
    )
    run_store.persist_latest(session)

    # Cold memory: clear in-memory registry only (keep disk files)
    with run_store._lock:  # noqa: SLF001
        run_store._runs.clear()  # noqa: SLF001
        run_store._latest_id = None  # noqa: SLF001

    hist = data_dir / "sessions" / "sess-validate-1.json"
    assert hist.exists(), "history file missing after persist"
    assert run_store.get_run("sess-validate-1") is not None

    health = client.get("/health")
    assert health.status_code == 200, health.text
    assert health.json()["status"] == "ok"

    response = client.post("/agent/runs/sess-validate-1/validate")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["menu_validated"] is True
    assert body["id"] == "sess-validate-1"
    print("OK validate after cold memory")

    # Reset flag and validate via /latest (F5-friendly path)
    run_store.update_run("sess-validate-1", menu_validated=False)
    with run_store._lock:  # noqa: SLF001
        run_store._runs.clear()  # noqa: SLF001
        run_store._latest_id = None  # noqa: SLF001
    latest_validate = client.post("/agent/sessions/latest/validate")
    assert latest_validate.status_code == 200, latest_validate.text
    assert latest_validate.json()["menu_validated"] is True
    # Dual mount /api prefix
    api_prefixed = client.post("/api/agent/sessions/latest/validate")
    assert api_prefixed.status_code == 200, api_prefixed.text
    print("OK validate via latest + /api prefix")

    profile = UserProfile(budget_eur=100, recipe_days=10)
    items = [ShoppingItem(name="Pain", quantity="1", aisle="Boulangerie")]
    _priced, report = price_shopping_list(items, profile)
    assert report.budget_eur == 100
    assert report.recipe_days == 10
    assert report.budget_per_day_eur == 10.0
    legacy = UserProfile.model_validate({"weekly_budget_eur": 70, "recipe_days": 5})
    assert legacy.budget_eur == 70
    profile_resp = client.get("/profile")
    assert profile_resp.status_code == 200
    assert "budget_eur" in profile_resp.json()
    print("OK budget period")

    rename = client.patch(
        "/agent/sessions/sess-validate-1",
        json={"title": "Courses week-end"},
    )
    assert rename.status_code == 200, rename.text
    assert rename.json()["title"] == "Courses week-end"

    listing = client.get("/agent/sessions")
    assert listing.status_code == 200
    titles = {s["id"]: s["title"] for s in listing.json()}
    assert titles.get("sess-validate-1") == "Courses week-end"

    deleted = client.delete("/agent/sessions/sess-validate-1")
    assert deleted.status_code == 200
    listing2 = client.get("/agent/sessions")
    ids = {s["id"] for s in listing2.json()}
    assert "sess-validate-1" not in ids
    print("OK rename/delete")
    print("All API smoke tests passed.")


def test_api_smoke():
    _run()


if __name__ == "__main__":
    try:
        _run()
    except AssertionError as exc:
        print(f"FAIL: {exc!r}", file=sys.stderr)
        raise
