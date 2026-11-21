"""Raport zapisu wydarzeń: potwierdzone wyniki i niepewność po awarii."""

from typing import Literal
from pydantic import BaseModel

from backend.models.calendar import CalendarEvent


class ScheduleError(BaseModel):
    code: str
    message: str


class ScheduleResult(BaseModel):
    event: CalendarEvent
    status: Literal["created", "failed", "unknown", "not_attempted"]
    google_event_id: str | None = None
    html_link: str | None = None
    error: ScheduleError | None = None


class ScheduleResponse(BaseModel):
    calendar_id: str
    status: Literal["completed", "partial", "failed"]
    results: list[ScheduleResult]
