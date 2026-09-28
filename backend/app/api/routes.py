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
    AgentRunRequest,
    AgentSession,
    HealthResponse,
    IntegrationStatus,
    UserProfile,
)
from app.storage import profile_store, run_store

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness + configuration readiness (no secret values exposed)."""
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
    """Return the persisted profile, or defaults if none saved yet."""
    return profile_store.load_profile()


@router.put("/profile", response_model=UserProfile)
def put_profile(profile: UserProfile) -> UserProfile:
    """Validate and persist the user profile to data/profile.json."""
    return profile_store.save_profile(profile)


@router.get("/models", response_model=GeminiModelsResponse)
def list_gemini_models() -> GeminiModelsResponse:
    """List Gemini 3.x models available for profile selection + fallback chain."""
    return list_models_response()


async def _execute_run_async(run_id: str) -> None:
    """Run the blocking Gemini loop off the event loop."""
    await asyncio.to_thread(orchestrator.execute_run, run_id)


@router.post("/agent/run", response_model=AgentSession, status_code=202)
async def start_agent_run(
    body: AgentRunRequest,
    background_tasks: BackgroundTasks,
) -> AgentSession:
    """Start an agent run in the background; poll or stream for progress."""
    session = orchestrator.start_run(body.prompt)
    background_tasks.add_task(_execute_run_async, session.id)
    return session


@router.get("/agent/runs/{run_id}", response_model=AgentSession)
def get_agent_run(run_id: str) -> AgentSession:
    session = run_store.get_run(run_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Run introuvable")
    return session


@router.get("/agent/sessions/latest", response_model=AgentSession)
def get_latest_session() -> AgentSession:
    session = run_store.get_latest()
    if session is None:
        raise HTTPException(status_code=404, detail="Aucune session disponible")
    return session


@router.get("/agent/runs/{run_id}/stream")
async def stream_agent_run(run_id: str) -> StreamingResponse:
    """SSE stream of log events until the run completes or fails."""

    async def event_generator():
        last_count = 0
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

            if session.status in {"completed", "failed"}:
                done = {
                    "type": "done",
                    "status": session.status,
                    "session": session.model_dump(mode="json"),
                }
                yield f"event: done\ndata: {json.dumps(done, ensure_ascii=False)}\n\n"
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
