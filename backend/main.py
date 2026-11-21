"""Punkt składania i uruchamiania aplikacji FastAPI."""

from fastapi import FastAPI

from backend.controllers import extraction, health
from backend.core.config import get_settings
from backend.core.error_handlers import register_error_handlers


def create_app() -> FastAPI:
    get_settings()  # Błędna konfiguracja przerywa start aplikacji.
    app = FastAPI(title="Note2Task", docs_url=None, redoc_url=None)
    register_error_handlers(app)
    app.include_router(extraction.router)
    app.include_router(health.router)
    return app


app = create_app()
