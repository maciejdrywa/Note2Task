"""Analiza i sekwencyjny zapis; po pierwszym błędzie nie wykonujemy kolejnych zapisów."""

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from backend.clients.google_calendar import GoogleCalendarClient
from backend.core.exceptions import CalendarWriteError, InvalidModelResponse
from backend.models.calendar import CalendarEvent
from backend.models.scheduling import ScheduleError, ScheduleResponse, ScheduleResult
from backend.services.note_service import NoteService


def validate_events(events: list[CalendarEvent]) -> None:
    try:
        for event in events:
            start = datetime.fromisoformat(event.start.dateTime)
            end = datetime.fromisoformat(event.end.dateTime)
            ZoneInfo(event.start.timeZone)
            ZoneInfo(event.end.timeZone)
            if start.utcoffset() is None or end.utcoffset() is None or end <= start:
                raise ValueError("Invalid time range")
    except (ValueError, TypeError, ZoneInfoNotFoundError) as exc:
        raise InvalidModelResponse("Niepoprawne daty lub zakres czasu wydarzenia.") from exc


class SchedulingService:
    def __init__(self, notes: NoteService, calendar: GoogleCalendarClient):
        self.notes = notes
        self.calendar = calendar

    def schedule(self, text: str) -> ScheduleResponse:
        self.calendar.authorize()
        events = self.notes.process_text(text)
        validate_events(events)
        results = []
        stopped = False
        for event in events:
            if stopped:
                results.append(ScheduleResult(event=event, status="not_attempted"))
                continue
            try:
                saved = self.calendar.insert_event(event)
                results.append(ScheduleResult(
                    event=event, status="created", google_event_id=saved["id"], html_link=saved["htmlLink"],
                ))
            except CalendarWriteError as exc:
                stopped = True
                results.append(ScheduleResult(
                    event=event, status=exc.outcome, error=ScheduleError(code=exc.code, message=str(exc)),
                ))
        status = "completed" if not stopped else "partial" if any(r.status == "created" for r in results) else "failed"
        return ScheduleResponse(calendar_id=self.calendar.settings.google_calendar_id, status=status, results=results)
