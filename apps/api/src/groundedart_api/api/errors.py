from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from groundedart_api.domain.errors import AppError

logger = logging.getLogger(__name__)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details or {},
                }
            },
        )

    @app.exception_handler(Exception)
    async def _handle_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        """Handle unhandled exceptions to ensure CORS headers are included in error responses."""
        logger.exception(
            "Unhandled exception",
            exc_info=exc,
            extra={
                "path": request.url.path,
                "method": request.method,
                "origin": request.headers.get("origin"),
            },
        )
        # FastAPI's CORS middleware should automatically add headers to JSONResponse
        # but we return a proper JSONResponse to ensure it goes through the middleware stack
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_server_error",
                    "message": "An internal server error occurred",
                    "details": {},
                }
            },
        )
