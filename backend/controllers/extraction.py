"""Kontroler analizy notatek."""

from typing import Annotated
from fastapi import APIRouter, Depends

from backend.core.dependencies import get_note_service
from backend.models.calendar import CalendarEvent
from backend.models.requests import ExtractRequest
from backend.services.note_service import NoteService

router = APIRouter()


@router.post("/extract", response_model=list[CalendarEvent])
def extract(request: ExtractRequest, service: Annotated[NoteService, Depends(get_note_service)]) -> list[CalendarEvent]:
    return service.process_text(request.text)
