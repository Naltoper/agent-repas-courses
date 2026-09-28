"""In-memory run registry + JSON history of agent sessions."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings
from app.models.schemas import (
    AgentLogEvent,
    AgentSession,
    SessionSummary,
    ShoppingItem,
)

_lock = threading.Lock()
_runs: dict[str, AgentSession] = {}
_latest_id: str | None = None

SESSION_FILENAME = "latest_session.json"
HISTORY_DIRNAME = "sessions"
INDEX_FILENAME = "sessions_index.json"


def _data_dir() -> Path:
    settings = get_settings()
    path = settings.resolved_data_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def _history_dir() -> Path:
    path = _data_dir() / HISTORY_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_path() -> Path:
    return _data_dir() / INDEX_FILENAME


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session_title(session: AgentSession) -> str:
    if session.title.strip():
        return session.title.strip()
    prompt = session.prompt.strip()
    if len(prompt) <= 60:
        return prompt or "Session sans titre"
    return prompt[:57] + "…"


def _to_summary(session: AgentSession) -> SessionSummary:
    result = session.result
    shopping = result.shopping_list if result else []
    checked = sum(1 for item in shopping if item.checked)
    return SessionSummary(
        id=session.id,
        prompt=session.prompt,
        status=session.status,
        title=_session_title(session),
        updated_at=session.updated_at,
        days_count=len(result.days) if result else 0,
        shopping_count=len(shopping),
        checked_count=checked,
        estimated_total_eur=(
            result.budget.estimated_total_eur if result and result.budget else None
        ),
    )


def _write_index(summaries: list[SessionSummary]) -> None:
    path = _index_path()
    path.write_text(
        json.dumps(
            [s.model_dump(mode="json") for s in summaries],
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def _read_index() -> list[SessionSummary]:
    path = _index_path()
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    data = json.loads(raw)
    return [SessionSummary.model_validate(item) for item in data]


def _upsert_index(session: AgentSession) -> None:
    summary = _to_summary(session)
    existing = _read_index()
    filtered = [s for s in existing if s.id != session.id]
    filtered.insert(0, summary)
    _write_index(filtered[:50])


def create_run(session: AgentSession) -> AgentSession:
    global _latest_id
    stamped = session.model_copy(
        update={
            "updated_at": _now_iso(),
            "title": _session_title(session),
        }
    )
    with _lock:
        _runs[stamped.id] = stamped
        _latest_id = stamped.id
    return stamped


def get_run(run_id: str) -> AgentSession | None:
    with _lock:
        session = _runs.get(run_id)
        if session is not None:
            return session.model_copy(deep=True)
    path = _history_dir() / f"{run_id}.json"
    if path.exists():
        return AgentSession.model_validate_json(path.read_text(encoding="utf-8"))
    latest = _data_dir() / SESSION_FILENAME
    if latest.exists():
        candidate = AgentSession.model_validate_json(latest.read_text(encoding="utf-8"))
        if candidate.id == run_id:
            return candidate
    return None


def get_latest() -> AgentSession | None:
    with _lock:
        if _latest_id and _latest_id in _runs:
            return _runs[_latest_id].model_copy(deep=True)
    path = _data_dir() / SESSION_FILENAME
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    return AgentSession.model_validate_json(raw)


def list_summaries() -> list[SessionSummary]:
    return _read_index()


def append_log(
    run_id: str,
    message: str,
    *,
    level: str = "info",
    tool: str | None = None,
) -> AgentLogEvent:
    event = AgentLogEvent(
        level=level,
        tool=tool,
        message=message,
        timestamp=_now_iso(),
    )
    with _lock:
        session = _runs.get(run_id)
        if session is None:
            return event
        session.logs.append(event)
        session.updated_at = _now_iso()
    return event


def update_run(run_id: str, **fields: object) -> AgentSession | None:
    """Update a run, hydrating from disk when the process no longer has it in memory."""
    with _lock:
        session = _runs.get(run_id)
    if session is None:
        # Load without holding the lock (get_run acquires it briefly)
        session = get_run(run_id)
        if session is None:
            return None
        with _lock:
            # Another writer may have won; prefer in-memory if present
            if run_id not in _runs:
                _runs[run_id] = session
                global _latest_id
                if _latest_id is None:
                    _latest_id = run_id

    with _lock:
        session = _runs.get(run_id)
        if session is None:
            return None
        payload = dict(fields)
        payload["updated_at"] = _now_iso()
        draft = session.model_copy(update=payload)
        if "title" in payload:
            title = str(payload.get("title") or "").strip()
            draft = draft.model_copy(update={"title": title or _session_title(draft)})
        elif not (draft.title or "").strip():
            draft = draft.model_copy(update={"title": _session_title(draft)})
        _runs[run_id] = draft
        return draft.model_copy(deep=True)


def rename_session(run_id: str, title: str) -> AgentSession | None:
    cleaned = title.strip()
    if not cleaned:
        return None
    updated = update_run(run_id, title=cleaned)
    if updated is None:
        return None
    persist_latest(updated)
    return updated


def delete_session(run_id: str) -> bool:
    """Remove a session from history, disk, and memory. Returns False if unknown."""
    global _latest_id
    path = _history_dir() / f"{run_id}.json"
    existed = path.exists()
    with _lock:
        in_memory = run_id in _runs
        if in_memory:
            del _runs[run_id]
        if _latest_id == run_id:
            _latest_id = None

    if path.exists():
        path.unlink()

    latest_path = _data_dir() / SESSION_FILENAME
    if latest_path.exists():
        try:
            candidate = AgentSession.model_validate_json(
                latest_path.read_text(encoding="utf-8")
            )
            if candidate.id == run_id:
                latest_path.unlink()
        except Exception:
            pass

    existing = _read_index()
    filtered = [s for s in existing if s.id != run_id]
    if len(filtered) != len(existing):
        _write_index(filtered)
        existed = True
    return existed or in_memory


def persist_latest(session: AgentSession) -> None:
    stamped = session.model_copy(
        update={
            "updated_at": session.updated_at or _now_iso(),
            "title": _session_title(session),
        }
    )
    latest_path = _data_dir() / SESSION_FILENAME
    latest_path.write_text(
        json.dumps(stamped.model_dump(mode="json"), ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    history_path = _history_dir() / f"{stamped.id}.json"
    history_path.write_text(
        json.dumps(stamped.model_dump(mode="json"), ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    _upsert_index(stamped)
    with _lock:
        _runs[stamped.id] = stamped
        global _latest_id
        _latest_id = stamped.id


def load_into_memory(session: AgentSession) -> AgentSession:
    with _lock:
        global _latest_id
        _runs[session.id] = session
        _latest_id = session.id
    return session


def set_shopping_checks(
    run_id: str,
    updates: dict[str, bool],
) -> AgentSession | None:
    session = get_run(run_id)
    if session is None or session.result is None:
        return None
    items: list[ShoppingItem] = []
    for item in session.result.shopping_list:
        if item.id in updates:
            items.append(item.model_copy(update={"checked": updates[item.id]}))
        else:
            items.append(item)
    # Keep unchecked first for stable UX when reloading
    items.sort(key=lambda i: (i.checked, i.aisle, i.name.lower()))
    result = session.result.model_copy(update={"shopping_list": items})
    updated = update_run(run_id, result=result)
    if updated:
        persist_latest(updated)
    return updated


def reset_shopping_checks(run_id: str) -> AgentSession | None:
    session = get_run(run_id)
    if session is None or session.result is None:
        return None
    items = [
        item.model_copy(update={"checked": False})
        for item in session.result.shopping_list
    ]
    result = session.result.model_copy(update={"shopping_list": items})
    updated = update_run(run_id, result=result)
    if updated:
        persist_latest(updated)
    return updated


def clear_workspace() -> None:
    """Drop in-memory runs and the latest_session pointer (history kept)."""
    global _latest_id
    latest_path = _data_dir() / SESSION_FILENAME
    if latest_path.exists():
        latest_path.unlink()
    with _lock:
        _runs.clear()
        _latest_id = None
