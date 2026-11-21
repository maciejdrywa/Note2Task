"""Przekształcenie wyodrębnionych zadań w wydarzenia, wyłącznie w pamięci."""

import datetime
from zoneinfo import ZoneInfo

from backend.core.config import Settings
from backend.core.exceptions import InvalidModelResponse
from backend.models.calendar import CalendarEvent
from backend.services.date_service import create_calendar_event
from backend.services.extraction_service import ExtractionService


class NoteService:
    def __init__(self, extractor: ExtractionService, settings: Settings):
        self.extractor = extractor
        self.settings = settings

    def process_text(self, text: str) -> list[CalendarEvent]:
        tasks = self.extractor.extract_from_text(text)
        base_date = datetime.datetime.now(ZoneInfo(self.settings.default_timezone)).date()
        try:
            return [
                create_calendar_event(
                    task, base_date=base_date, time_zone=self.settings.default_timezone,
                    default_duration_min=self.settings.default_duration_minutes,
                )
                for sentence_tasks in tasks.values()
                for task in sentence_tasks
            ]
        except (ValueError, TypeError, OverflowError) as exc:
            raise InvalidModelResponse("Model zwrócił niepoprawny termin wydarzenia.") from exc
