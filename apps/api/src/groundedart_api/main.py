from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from groundedart_api.api.errors import install_error_handlers
from groundedart_api.api.routers.admin import router as admin_router
from groundedart_api.api.routers.captures import router as captures_router
from groundedart_api.api.routers.health import router as health_router
from groundedart_api.api.routers.me import router as me_router
from groundedart_api.api.routers.nodes import router as nodes_router
from groundedart_api.api.routers.sessions import router as sessions_router
from groundedart_api.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Grounded Art API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        # AnyHttpUrl normalizes to a trailing slash, but browser Origin headers do not.
        # Ensure we compare against the canonical Origin form (`scheme://host[:port]`).
        allow_origins=[str(o).rstrip("/") for o in settings.api_cors_origins],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(sessions_router)
    app.include_router(me_router)
    app.include_router(nodes_router)
    app.include_router(captures_router)
    app.include_router(admin_router)

    Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")
    install_error_handlers(app)
    return app


app = create_app()
