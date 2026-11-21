"""Podział notatki, instrukcje dla modelu i walidacja wyodrębnionych zadań."""

import json
import re
from typing import Dict, List, Union

from backend.clients.ollama import OllamaClient
from backend.core.exceptions import InvalidModelResponse
from backend.models.calendar import ExtractedTaskRaw
from backend.prompts.extraction import SYSTEM_PROMPT

SENTENCE_SPLIT_REGEX = re.compile(
    r"(?:\r?\n)+|(?<!\bgodz)(?:(?<!\d)\.|\.(?!\d)|[!?])+",
    re.IGNORECASE,
)


def split_text_into_sentences(text: str) -> Dict[str, str]:
    """Dzieli nieustrukturyzowany tekst na słownik ponumerowanych zdań po kropkach, !?, i nowych liniach."""
    parts = [part.strip() for part in SENTENCE_SPLIT_REGEX.split(text.strip()) if part and part.strip()]
    if not parts:
        parts = [text.strip()] if text.strip() else []
    return {f"zdanie{i}": sentence for i, sentence in enumerate(parts, start=1)}


class ExtractionService:
    def __init__(self, client: OllamaClient):
        self.client = client

    def extract_from_text(self, text: str) -> Dict[str, List[ExtractedTaskRaw]]:
        return self.extract_from_sentences(split_text_into_sentences(text))

    def extract_from_sentences(self, sentences: Dict[str, str]) -> Dict[str, List[ExtractedTaskRaw]]:
        if not sentences:
            return {}
        content = self.client.chat([
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': 'Przeanalizuj poniższe zdania i zwróć JSON:\n' + json.dumps(sentences, ensure_ascii=False)},
        ])
        try:
            return self._parse_raw_response(json.loads(content), list(sentences))
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidModelResponse('Model zwrócił niepoprawne dane zadań lub JSON.') from exc

    def _parse_raw_response(self, raw_data: Union[dict, list], expected_keys: List[str]) -> Dict[str, List[ExtractedTaskRaw]]:
        """Parsuje i waliduje wyjściowy JSON do obiektów Pydantic ExtractedTaskRaw, bezpiecznie obsługując listę lub słownik."""
        if isinstance(raw_data, list):
            if len(expected_keys) != 1:
                raise InvalidModelResponse("Brak przyporządkowania zadań do zdań.")
            target_dict = {expected_keys[0]: raw_data}
        elif isinstance(raw_data, dict):
            target_dict = raw_data
            for wrapper_key in ("zdania", "wyniki", "result", "sentences"):
                if wrapper_key in raw_data and isinstance(raw_data[wrapper_key], dict):
                    target_dict = raw_data[wrapper_key]
                    break
        else:
            raise InvalidModelResponse("Wynik modelu musi być słownikiem lub listą.")

        results: Dict[str, List[ExtractedTaskRaw]] = {}

        for key in expected_keys:
            if key not in target_dict:
                raise InvalidModelResponse(f"Brak wyniku dla {key}.")
            items = target_dict[key]
            if not isinstance(items, list):
                if isinstance(items, dict):
                    items = [items]
                else:
                    raise InvalidModelResponse(f"Niepoprawna lista zadań dla {key}.")

            validated_tasks = []
            for item in items:
                if not isinstance(item, dict):
                    raise InvalidModelResponse("Zadanie musi być obiektem JSON.")
                czynnosc = item.get("czynnosc") or item.get("czynność") or item.get("zadanie") or item.get("aktywność")
                if not isinstance(czynnosc, str) or not czynnosc.strip():
                    raise InvalidModelResponse("Zadanie nie zawiera nazwy czynności.")

                godzina_start = item.get("godzina_start") or item.get("godzina")
                if isinstance(godzina_start, str):
                    godzina_start = godzina_start.strip().replace(".", ":")
                    if re.match(r"^\d:\d{2}$", godzina_start):
                        godzina_start = "0" + godzina_start

                godzina_koniec = item.get("godzina_koniec")
                if isinstance(godzina_koniec, str):
                    godzina_koniec = godzina_koniec.strip().replace(".", ":")
                    if re.match(r"^\d:\d{2}$", godzina_koniec):
                        godzina_koniec = "0" + godzina_koniec

                czas_trwania = item.get("czas_trwania_minuty") or item.get("czas_trwania")
                try:
                    czas_trwania = int(czas_trwania) if czas_trwania is not None else None
                except (ValueError, TypeError):
                    czas_trwania = None

                task = ExtractedTaskRaw(
                    czynnosc=str(czynnosc).strip(),
                    wyrazenie_czasu=item.get("wyrazenie_czasu"),
                    godzina_start=godzina_start,
                    godzina_koniec=godzina_koniec,
                    czas_trwania_minuty=czas_trwania,
                    opis=item.get("opis"),
                    data_wzgledna=item.get("data_wzgledna", "dzisiaj")
                )
                validated_tasks.append(task)

            results[key] = validated_tasks

        return results
