"""Optional Postgres persistence (Northflank addon). Falls back to files when unset."""

from __future__ import annotations

import json
import os
from typing import Any

from app.core.config import get_settings

_schema_ready = False


def database_url() -> str:
    settings = get_settings()
    return (
        settings.database_url.strip()
        or os.environ.get("POSTGRES_URI", "").strip()
        or os.environ.get("DATABASE_URL", "").strip()
    )


def enabled() -> bool:
    return bool(database_url())


def _connect():
    import psycopg

    return psycopg.connect(database_url(), autocommit=True)


def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready or not enabled():
        return
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS smartchef_profile (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    payload JSONB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS smartchef_sessions (
                    id TEXT PRIMARY KEY,
                    payload JSONB NOT NULL,
                    summary JSONB NOT NULL,
                    updated_at TIMESTAMPTZ,
                    is_latest BOOLEAN NOT NULL DEFAULT FALSE
                );
                CREATE INDEX IF NOT EXISTS smartchef_sessions_latest_idx
                    ON smartchef_sessions (is_latest) WHERE is_latest;
                CREATE INDEX IF NOT EXISTS smartchef_sessions_updated_idx
                    ON smartchef_sessions (updated_at DESC);
                """
            )
    _schema_ready = True


def load_profile_payload() -> dict[str, Any] | None:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT payload FROM smartchef_profile WHERE id = 1")
            row = cur.fetchone()
            return row[0] if row else None


def save_profile_payload(payload: dict[str, Any]) -> None:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO smartchef_profile (id, payload)
                VALUES (1, %s::jsonb)
                ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                """,
                (json.dumps(payload),),
            )


def upsert_session(
    session_id: str,
    payload: dict[str, Any],
    summary: dict[str, Any],
    *,
    mark_latest: bool = True,
) -> None:
    ensure_schema()
    updated_at = payload.get("updated_at")
    with _connect() as conn:
        with conn.cursor() as cur:
            if mark_latest:
                cur.execute("UPDATE smartchef_sessions SET is_latest = FALSE WHERE is_latest")
            cur.execute(
                """
                INSERT INTO smartchef_sessions (id, payload, summary, updated_at, is_latest)
                VALUES (%s, %s::jsonb, %s::jsonb, %s::timestamptz, %s)
                ON CONFLICT (id) DO UPDATE SET
                    payload = EXCLUDED.payload,
                    summary = EXCLUDED.summary,
                    updated_at = EXCLUDED.updated_at,
                    is_latest = EXCLUDED.is_latest
                """,
                (
                    session_id,
                    json.dumps(payload),
                    json.dumps(summary),
                    updated_at,
                    mark_latest,
                ),
            )


def get_session_payload(session_id: str) -> dict[str, Any] | None:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT payload FROM smartchef_sessions WHERE id = %s",
                (session_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None


def get_latest_payload() -> dict[str, Any] | None:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload FROM smartchef_sessions
                WHERE is_latest
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1
                """
            )
            row = cur.fetchone()
            return row[0] if row else None


def list_summary_payloads(limit: int = 50) -> list[dict[str, Any]]:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT summary FROM smartchef_sessions
                ORDER BY updated_at DESC NULLS LAST
                LIMIT %s
                """,
                (limit,),
            )
            return [row[0] for row in cur.fetchall()]


def delete_session_row(session_id: str) -> bool:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM smartchef_sessions WHERE id = %s",
                (session_id,),
            )
            return cur.rowcount > 0


def clear_latest_flag() -> None:
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE smartchef_sessions SET is_latest = FALSE WHERE is_latest")
