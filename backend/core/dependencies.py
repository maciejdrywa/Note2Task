"""Składanie klienta i serwisów przez zależności FastAPI."""

from typing import Annotated
from fastapi import Depends

from backend.clients.ollama import OllamaClient
from backend.core.config import Settings, get_settings
from backend.services.extraction_service import ExtractionService
from backend.services.note_service import NoteService
from backend.services.health_service import HealthService


def get_ollama_client(settings: Annotated[Settings, Depends(get_settings)]) -> OllamaClient:
    return OllamaClient(str(settings.ollama_host), settings.model_name, settings.ollama_timeout)


def get_extraction_service(client: Annotated[OllamaClient, Depends(get_ollama_client)]) -> ExtractionService:
    return ExtractionService(client)


def get_health_service(client: Annotated[OllamaClient, Depends(get_ollama_client)]) -> HealthService:
    return HealthService(client)


def get_note_service(
    extractor: Annotated[ExtractionService, Depends(get_extraction_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> NoteService:
    return NoteService(extractor, settings)
