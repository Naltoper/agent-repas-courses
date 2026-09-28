"""SmartChef Agent — FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import reload_settings
from app.storage import run_store


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = reload_settings()
    # Hydrate latest session so validate/shopping work after process restart / F5
    latest = run_store.get_latest()
    if latest is not None:
        run_store.load_into_memory(latest)
        print(f"[smartchef] restored session {latest.id} ({latest.status})")
    print(
        f"[smartchef] env={settings.app_env} "
        f"gemini={'ready' if settings.has_gemini else 'missing'} "
        f"model={settings.gemini_model}"
    )
    yield


def create_app() -> FastAPI:
    settings = reload_settings()
    application = FastAPI(
        title="SmartChef Agent API",
        description="Backend de planification alimentaire et gestion de courses intelligente.",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        # Preview / prod Vercel without listing every subdomain
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Root paths (Vite strips /api) + /api prefix for direct VITE_API_URL=*/api clients
    application.include_router(router)
    application.include_router(router, prefix="/api")
    return application


app = create_app()


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "smartchef-agent",
        "docs": "/docs",
        "health": "/health",
    }
