from __future__ import annotations

import logging
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
from groundedart_api.api.routers.tips import router as tips_router
from groundedart_api.observability.logging import access_log, configure_logging
from groundedart_api.observability.metrics import render_metrics
from groundedart_api.observability.middleware import RequestContextMiddleware
from groundedart_api.observability.tracing import configure_tracing
from groundedart_api.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    logger = logging.getLogger("groundedart_api.main")
    app = FastAPI(title="Grounded Art API", version="0.1.0")

    # CORS middleware must be added before other middleware to handle preflight requests
    cors_origins = [str(o).rstrip("/") for o in settings.api_cors_origins]
    logger.info(f"Configuring CORS with allowed origins: {cors_origins}")
    app.add_middleware(
        CORSMiddleware,
        # AnyHttpUrl normalizes to a trailing slash, but browser Origin headers do not.
        # Ensure we compare against the canonical Origin form (`scheme://host[:port]`).
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(RequestContextMiddleware, access_log=access_log)

    # Install error handlers early to ensure they catch all exceptions
    install_error_handlers(app)

    app.include_router(health_router)
    app.include_router(sessions_router)
    app.include_router(me_router)
    app.include_router(nodes_router)
    app.include_router(captures_router)
    app.include_router(tips_router)
    app.include_router(admin_router)

    app.add_api_route(
        "/metrics", render_metrics, methods=["GET"], include_in_schema=False
    )

    Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
    if settings.media_serve_static:
        app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")
    configure_tracing(app)
    return app


app = create_app()
