"""Błędy domenowe niezależne od frameworka HTTP."""


class OllamaUnavailable(ConnectionError):
    """Serwer Ollama lub wymagany model jest niedostępny."""


class InvalidModelResponse(ValueError):
    """Odpowiedź modelu nie spełnia kontraktu ekstrakcji."""
