"""In-memory run registry + optional JSON snapshot of the latest session."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings
from app.models.schemas import AgentLogEvent, AgentSession

_lock = threading.Lock()
_runs: dict[str, AgentSession] = {}
_latest_id: str | None = None

SESSION_FILENAME = "latest_session.json"


def _data_dir() -> Path:
    settings = get_settings()
    path = Path(settings.data_dir)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_run(session: AgentSession) -> AgentSession:
    global _latest_id
    with _lock:
        _runs[session.id] = session
        _latest_id = session.id
    return session


def get_run(run_id: str) -> AgentSession | None:
    with _lock:
        session = _runs.get(run_id)
        return session.model_copy(deep=True) if session else None


def get_latest() -> AgentSession | None:
    with _lock:
        if _latest_id and _latest_id in _runs:
            return _runs[_latest_id].model_copy(deep=True)
    # Fallback to disk
    path = _data_dir() / SESSION_FILENAME
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    return AgentSession.model_validate_json(raw)


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
    return event


def update_run(run_id: str, **fields: object) -> AgentSession | None:
    with _lock:
        session = _runs.get(run_id)
        if session is None:
            return None
        updated = session.model_copy(update=fields)
        _runs[run_id] = updated
        return updated.model_copy(deep=True)


def persist_latest(session: AgentSession) -> None:
    path = _data_dir() / SESSION_FILENAME
    path.write_text(
        json.dumps(session.model_dump(mode="json"), ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
