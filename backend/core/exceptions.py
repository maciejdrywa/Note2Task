"""Błędy domenowe niezależne od frameworka HTTP."""


class OllamaUnavailable(ConnectionError):
    """Serwer Ollama lub wymagany model jest niedostępny."""


class InvalidModelResponse(ValueError):
    """Odpowiedź modelu nie spełnia kontraktu ekstrakcji."""


class GoogleAuthRequired(Exception):
    """Brak poprawnej autoryzacji konta demonstracyjnego."""

    def __init__(self):
        super().__init__("Uruchom na komputerze: python -m backend.tools.authorize_google")


class CalendarWriteError(Exception):
    """Znany błąd zapisu lub niepewność, czy zapis został wykonany."""

    def __init__(self, code: str, message: str, outcome: str = "failed"):
        super().__init__(message)
        self.code = code
        self.outcome = outcome
