"""HTTP routes for SmartChef Agent."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse

from app.agent import orchestrator
from app.core.config import get_settings
from app.core.gemini_models import GeminiModelsResponse, list_models_response
from app.models.schemas import (
    AgentFollowUpRequest,
    AgentRunRequest,
    AgentSession,
    HealthResponse,
    IntegrationStatus,
    SessionRenameRequest,
    SessionSummary,
    ShoppingBulkCheckUpdate,
    ShoppingCheckUpdate,
    UserProfile,
)
from app.storage import profile_store, run_store

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service="smartchef-agent",
        version="0.1.0",
        environment=settings.app_env,
        integrations=IntegrationStatus(
            gemini=settings.has_gemini,
            youtube=settings.has_youtube,
            google_keep=settings.has_keep,
        ),
    )


@router.get("/profile", response_model=UserProfile)
def get_profile() -> UserProfile:
    return profile_store.load_profile()


@router.put("/profile", response_model=UserProfile)
def put_profile(profile: UserProfile) -> UserProfile:
    return profile_store.save_profile(profile)


@router.get("/models", response_model=GeminiModelsResponse)
def list_gemini_models() -> GeminiModelsResponse:
    return list_models_response()


async def _execute_run_async(run_id: str) -> None:
    await asyncio.to_thread(orchestrator.execute_run, run_id)


async def _execute_follow_up_async(run_id: str, message: str) -> None:
    await asyncio.to_thread(orchestrator.execute_follow_up, run_id, message)


def _require_run(run_id: str) -> AgentSession:
    session = run_store.get_run(run_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Run introuvable")
    return session


@router.post("/agent/run", response_model=AgentSession, status_code=202)
async def start_agent_run(
    body: AgentRunRequest,
    background_tasks: BackgroundTasks,
) -> AgentSession:
    session = orchestrator.start_run(body.prompt)
    background_tasks.add_task(_execute_run_async, session.id)
    return session


@router.post("/agent/runs/{run_id}/message", response_model=AgentSession, status_code=202)
async def follow_up_agent_run(
    run_id: str,
    body: AgentFollowUpRequest,
    background_tasks: BackgroundTasks,
) -> AgentSession:
    session = run_store.get_run(run_id)
    if session is None:
        latest = run_store.get_latest()
        if latest is None or latest.id != run_id:
            raise HTTPException(status_code=404, detail="Run introuvable")
        run_store.create_run(latest)
        session = latest

    if session.status == "running":
        raise HTTPException(status_code=409, detail="Un tour agent est déjà en cours")
    if session.result is None:
        raise HTTPException(
            status_code=400,
            detail="Session sans menu — lancez d'abord une génération réussie",
        )

    run_store.update_run(run_id, status="running", error=None, menu_validated=False)
    background_tasks.add_task(_execute_follow_up_async, run_id, body.message)
    refreshed = run_store.get_run(run_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Run introuvable")
    return refreshed


@router.get("/agent/runs/{run_id}", response_model=AgentSession)
def get_agent_run(run_id: str) -> AgentSession:
    return _require_run(run_id)


@router.get("/agent/sessions/latest", response_model=AgentSession)
def get_latest_session() -> AgentSession:
    session = run_store.get_latest()
    if session is None:
        raise HTTPException(status_code=404, detail="Aucune session disponible")
    return session


@router.post("/agent/sessions/latest/validate", response_model=AgentSession)
def validate_latest_session() -> AgentSession:
    """Validate the current latest session (survives F5 without relying on client run_id)."""
    session = run_store.get_latest()
    if session is None:
        raise HTTPException(status_code=404, detail="Aucune session disponible")
    if session.result is None:
        raise HTTPException(status_code=400, detail="Aucun menu à valider")
    run_store.load_into_memory(session)
    updated = run_store.update_run(session.id, menu_validated=True)
    if updated is None:
        raise HTTPException(status_code=404, detail="Run introuvable")
    run_store.persist_latest(updated)
    return updated


@router.get("/agent/sessions", response_model=list[SessionSummary])
def list_sessions() -> list[SessionSummary]:
    latest = run_store.get_latest()
    if latest is not None:
        run_store.persist_latest(latest)
    return run_store.list_summaries()


@router.post("/agent/sessions/{run_id}/load", response_model=AgentSession)
def load_session(run_id: str) -> AgentSession:
    session = _require_run(run_id)
    loaded = run_store.load_into_memory(session)
    run_store.persist_latest(loaded)
    return loaded


@router.patch("/agent/sessions/{run_id}", response_model=AgentSession)
def rename_session(run_id: str, body: SessionRenameRequest) -> AgentSession:
    updated = run_store.rename_session(run_id, body.title)
    if updated is None:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return updated


@router.delete("/agent/sessions/{run_id}", response_model=dict)
def delete_session(run_id: str) -> dict:
    if not run_store.delete_session(run_id):
        raise HTTPException(status_code=404, detail="Session introuvable")
    return {"ok": True, "id": run_id}


@router.post("/agent/runs/{run_id}/validate", response_model=AgentSession)
def validate_menu(run_id: str) -> AgentSession:
    session = _require_run(run_id)
    if session.result is None:
        raise HTTPException(status_code=400, detail="Aucun menu à valider")
    # Ensure hydrated in memory before update (survives process restarts)
    run_store.load_into_memory(session)
    updated = run_store.update_run(run_id, menu_validated=True)
    if updated is None:
        raise HTTPException(status_code=404, detail="Run introuvable")
    run_store.persist_latest(updated)
    return updated


@router.patch("/agent/runs/{run_id}/shopping/check", response_model=AgentSession)
def patch_shopping_check(run_id: str, body: ShoppingCheckUpdate) -> AgentSession:
    updated = run_store.set_shopping_checks(run_id, {body.item_id: body.checked})
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail="Run ou liste de courses introuvable",
        )
    return updated


@router.patch("/agent/runs/{run_id}/shopping/checks", response_model=AgentSession)
def patch_shopping_checks_bulk(
    run_id: str,
    body: ShoppingBulkCheckUpdate,
) -> AgentSession:
    updates = {item.item_id: item.checked for item in body.items}
    updated = run_store.set_shopping_checks(run_id, updates)
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail="Run ou liste de courses introuvable",
        )
    return updated


@router.post("/agent/runs/{run_id}/shopping/reset", response_model=AgentSession)
def reset_shopping_checks(run_id: str) -> AgentSession:
    updated = run_store.reset_shopping_checks(run_id)
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail="Run ou liste de courses introuvable",
        )
    return updated


@router.post("/agent/workspace/reset", response_model=dict)
def reset_workspace() -> dict:
    """Clear current workspace so the UI can start a fresh list (history kept)."""
    run_store.clear_workspace()
    return {"ok": True, "message": "Espace de travail réinitialisé"}


@router.get("/agent/runs/{run_id}/stream")
async def stream_agent_run(run_id: str) -> StreamingResponse:
    async def event_generator():
        last_count = 0
        last_msg_count = 0
        idle_rounds = 0
        while True:
            session = run_store.get_run(run_id)
            if session is None:
                payload = {"type": "error", "message": "Run introuvable"}
                yield f"event: error\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                break

            if len(session.logs) > last_count:
                for event in session.logs[last_count:]:
                    data = {
                        "type": "log",
                        "log": event.model_dump(mode="json"),
                        "status": session.status,
                    }
                    yield f"event: log\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                last_count = len(session.logs)
                idle_rounds = 0

            if len(session.messages) > last_msg_count:
                for msg in session.messages[last_msg_count:]:
                    data = {
                        "type": "chat",
                        "message": msg.model_dump(mode="json"),
                        "status": session.status,
                    }
                    yield f"event: chat\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                last_msg_count = len(session.messages)
                idle_rounds = 0

            if session.status in {"completed", "failed"}:
                # Wait a tick in case follow-up flips status back to running
                await asyncio.sleep(0.4)
                again = run_store.get_run(run_id)
                if again and again.status == "running":
                    idle_rounds = 0
                    continue
                done = {
                    "type": "done",
                    "status": session.status,
                    "session": (again or session).model_dump(mode="json"),
                }
                yield f"event: done\ndata: {json.dumps(done, ensure_ascii=False)}\n\n"
                break

            idle_rounds += 1
            if idle_rounds > 600:
                break
            await asyncio.sleep(0.35)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
