"""Lokalne tokeny konta demonstracyjnego; nigdy nie logujemy ich zawartości."""

import os
from pathlib import Path
import tempfile
import threading

from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from backend.core.config import Settings
from backend.core.exceptions import GoogleAuthRequired

GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events.owned"]
_token_lock = threading.RLock()


class RefreshRequest(Request):
    def __init__(self, timeout: float):
        super().__init__()
        self.timeout = timeout

    def __call__(self, *args, **kwargs):
        kwargs["timeout"] = self.timeout
        return super().__call__(*args, **kwargs)


def save_credentials(credentials: Credentials, path: Path) -> None:
    """Atomowy zapis zapobiega pozostawieniu częściowo zapisanego tokenu."""
    with _token_lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(credentials.to_json())
            temporary.chmod(0o600)
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


class GoogleCredentialsProvider:
    def __init__(self, settings: Settings):
        self.settings = settings

    def get_credentials(self) -> Credentials:
        with _token_lock:
            try:
                credentials = Credentials.from_authorized_user_file(str(self.settings.google_token_file))
                if not credentials.has_scopes(GOOGLE_SCOPES):
                    raise GoogleAuthRequired()
                if not credentials.valid:
                    if not credentials.refresh_token:
                        raise GoogleAuthRequired()
                    credentials.refresh(RefreshRequest(self.settings.google_calendar_timeout))
                    save_credentials(credentials, self.settings.google_token_file)
                return credentials
            except (OSError, ValueError, GoogleAuthError) as exc:
                raise GoogleAuthRequired() from exc
