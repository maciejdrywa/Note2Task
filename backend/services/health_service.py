"""Sprawdzenie gotowości zależności aplikacji."""

from backend.clients.ollama import OllamaClient
from backend.core.exceptions import InvalidModelResponse, OllamaUnavailable


class HealthService:
    def __init__(self, client: OllamaClient):
        self.client = client

    def check(self) -> dict:
        try:
            self.client.check_ready()
        except (InvalidModelResponse, TimeoutError) as exc:
            raise OllamaUnavailable(str(exc)) from exc
        return {"status": "ok", "model": self.client.model}
