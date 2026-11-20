"""Pipeline przetwarzania notatek tekstowych na wydarzenia kalendarzowe."""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from src.config import MODEL_NAME, OLLAMA_HOST
from src.date_resolver import create_calendar_event, convert_to_ground_truth_format
from src.extractor import OllamaNoteExtractor
from src.schemas import CalendarEvent, ExtractedTaskRaw


class Note2TaskPipeline:
    """Główny pipeline przetwarzający tekst na struktury kalendarza i ewaluacji."""

    def __init__(self, model_name: str = MODEL_NAME, host: str = OLLAMA_HOST):
        self.extractor = OllamaNoteExtractor(host=host, model=model_name)

    def process_text(self, text: str) -> Tuple[List[CalendarEvent], Dict[str, List[dict]], Dict[str, List[ExtractedTaskRaw]]]:
        """Przetwarza nieustrukturyzowany tekst notatki."""
        raw_sentence_tasks = self.extractor.extract_from_text(text)

        calendar_events: List[CalendarEvent] = []
        for sentence_key, tasks in raw_sentence_tasks.items():
            for task in tasks:
                event = create_calendar_event(task)
                calendar_events.append(event)

        gt_format = convert_to_ground_truth_format(raw_sentence_tasks)
        return calendar_events, gt_format, raw_sentence_tasks

    def process_file(
        self,
        file_path: Path,
        calendar_output_path: Optional[Path] = None,
        gt_output_path: Optional[Path] = None
    ) -> Tuple[List[CalendarEvent], Dict[str, List[dict]]]:
        """Wczytuje plik .txt, przetwarza go i opcjonalnie zapisuje wyniki do plików JSON."""
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Plik {file_path} nie istnieje.")

        text = file_path.read_text(encoding="utf-8-sig").strip()
        calendar_events, gt_format, raw_tasks = self.process_text(text)

        if calendar_output_path:
            calendar_output_path = Path(calendar_output_path)
            calendar_output_path.parent.mkdir(parents=True, exist_ok=True)
            events_data = [event.model_dump() for event in calendar_events]
            calendar_output_path.write_text(
                json.dumps(events_data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8"
            )

        if gt_output_path:
            gt_output_path = Path(gt_output_path)
            gt_output_path.parent.mkdir(parents=True, exist_ok=True)
            gt_output_path.write_text(
                json.dumps(gt_format, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8"
            )

        return calendar_events, gt_format
