"""Ekstraktor zadań wykorzystujący lokalny model LLM przez Ollama."""

import json
import logging
import re
import urllib.request
import urllib.error
from typing import Dict, List, Union

from src.config import OLLAMA_HOST, MODEL_NAME, REQUEST_TIMEOUT
from src.prompts import SYSTEM_PROMPT
from src.schemas import ExtractedTaskRaw

logger = logging.getLogger(__name__)

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


class OllamaNoteExtractor:
    """Klient lokalnego modelu Ollama do ekstrakcji zadań z tekstu z mechanizmem retry i zabezpieczeniami sieciowymi."""

    def __init__(self, host: str = OLLAMA_HOST, model: str = MODEL_NAME, timeout: int = REQUEST_TIMEOUT):
        self.host = host.rstrip("/")
        self.model = model
        self.timeout = timeout

    def extract_from_sentences(self, sentences: Dict[str, str]) -> Dict[str, List[ExtractedTaskRaw]]:
        """Ekstrahuje zadania ze słownika zdań {"zdanie1": "...", ...} z obsługą błędów i ponowieniem próby."""
        if not sentences:
            return {}

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Przeanalizuj poniższe zdania i zwróć JSON:\n{json.dumps(sentences, ensure_ascii=False)}"}
            ],
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0.0,
                "top_p": 0.9,
            }
        }

        url = f"{self.host}/api/chat"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    content = data.get("message", {}).get("content", "{}")
                    raw_data = json.loads(content)
                    return self._parse_raw_response(raw_data, list(sentences.keys()))
            except TimeoutError as e:
                logger.warning("Timeout połączenia z Ollama (%s), próba %d/2: %s", url, attempt + 1, e)
                if attempt == 1:
                    return {k: [] for k in sentences}
            except (urllib.error.URLError, OSError) as e:
                logger.error("Błąd sieciowy przy zapytaniu do Ollama (%s): %s", url, e)
                if attempt == 1:
                    raise ConnectionError(f"Nie można połączyć się z Ollama pod adresem {url}. Upewnij się, że usługa działa.") from e
            except json.JSONDecodeError as e:
                logger.error("Błąd dekodowania JSON z odpowiedzi modelu: %s", e)
                return {k: [] for k in sentences}

        return {k: [] for k in sentences}

    def extract_from_text(self, text: str) -> Dict[str, List[ExtractedTaskRaw]]:
        """Dzieli tekst na zdania i wykonuje ekstrakcję zadań."""
        sentences = split_text_into_sentences(text)
        return self.extract_from_sentences(sentences)

    def _parse_raw_response(self, raw_data: Union[dict, list], expected_keys: List[str]) -> Dict[str, List[ExtractedTaskRaw]]:
        """Parsuje i waliduje wyjściowy JSON do obiektów Pydantic ExtractedTaskRaw, bezpiecznie obsługując listę lub słownik."""
        if isinstance(raw_data, list):
            target_dict = {expected_keys[0]: raw_data} if expected_keys else {"zdanie1": raw_data}
        elif isinstance(raw_data, dict):
            target_dict = raw_data
            for wrapper_key in ("zdania", "wyniki", "result", "sentences"):
                if wrapper_key in raw_data and isinstance(raw_data[wrapper_key], dict):
                    target_dict = raw_data[wrapper_key]
                    break
        else:
            target_dict = {}

        results: Dict[str, List[ExtractedTaskRaw]] = {}

        for key in expected_keys:
            items = target_dict.get(key, [])
            if not isinstance(items, list):
                if isinstance(items, dict):
                    items = [items]
                else:
                    items = []

            validated_tasks = []
            for item in items:
                if isinstance(item, dict):
                    czynnosc = item.get("czynnosc") or item.get("czynność") or item.get("zadanie") or item.get("aktywność")
                    if not czynnosc:
                        continue

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
