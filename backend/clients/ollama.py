"""Transport HTTP do Ollamy; bez logiki ekstrakcji i kalendarza."""

import json
import urllib.request
import urllib.error
from backend.core.exceptions import InvalidModelResponse, OllamaUnavailable


class OllamaClient:
    def __init__(self, host: str, model: str, timeout: float):
        self.host = host.rstrip('/')
        self.model = model
        self.timeout = timeout

    def chat(self, messages: list[dict]) -> str:
        data = self._request_json('/api/chat', {
            'model': self.model, 'messages': messages,
            'format': 'json', 'stream': False,
            'options': {'temperature': 0.0, 'top_p': 0.9},
        })
        try:
            content = data['message']['content']
            if not isinstance(content, str):
                raise TypeError('content must be text')
            return content
        except (KeyError, TypeError) as exc:
            raise InvalidModelResponse('Ollama nie zwróciła treści odpowiedzi.') from exc

    def _request_json(self, path: str, payload: dict | None = None, timeout: int | None = None) -> dict:
        request = urllib.request.Request(
            f"{self.host}{path}",
            data=json.dumps(payload).encode("utf-8") if payload is not None else None,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout or self.timeout) as response:
                data = json.load(response)
            if not isinstance(data, dict):
                raise InvalidModelResponse("Ollama nie zwróciła obiektu JSON.")
            return data
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise OllamaUnavailable(f"Model {self.model} jest niedostępny. Sprawdź logi model.") from exc
            raise OllamaUnavailable(f"Ollama zwróciła błąd HTTP {exc.code}.") from exc
        except TimeoutError as exc:
            raise TimeoutError("Przekroczono czas oczekiwania na Ollamę.") from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise TimeoutError("Przekroczono czas oczekiwania na Ollamę.") from exc
            raise OllamaUnavailable(f"Nie można połączyć się z Ollamą pod {self.host}.") from exc
        except OSError as exc:
            raise OllamaUnavailable(f"Błąd połączenia z Ollamą pod {self.host}.") from exc
        except (ValueError, UnicodeError) as exc:
            raise InvalidModelResponse("Ollama zwróciła niepoprawny JSON.") from exc

    def check_ready(self) -> None:
        data = self._request_json("/api/tags", timeout=5)
        models = data.get("models")
        if not isinstance(models, list) or any(not isinstance(item, dict) for item in models):
            raise InvalidModelResponse("Niepoprawna lista modeli Ollamy.")
        expected = self.model if ":" in self.model else f"{self.model}:latest"
        if not any(expected in (item.get("name"), item.get("model")) for item in models):
            raise OllamaUnavailable(f"Model {self.model} nie został pobrany. Sprawdź logi model.")

