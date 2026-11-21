"""Punkt składania i uruchamiania aplikacji FastAPI."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.controllers import extraction, health, scheduling
from backend.core.config import get_settings
from backend.core.error_handlers import register_error_handlers


def create_app() -> FastAPI:
    get_settings()  # Błędna konfiguracja przerywa start aplikacji.
    app = FastAPI(title="Note2Task", docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:1420", "http://127.0.0.1:1420",
            "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
        ],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    register_error_handlers(app)
    app.include_router(extraction.router)
    app.include_router(health.router)
    app.include_router(scheduling.router)
    return app


app = create_app()
