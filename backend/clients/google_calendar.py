"""Wywołania Google Calendar z jawnym wynikiem niepewnym i bez ponowień zapisu."""

import http.client
import socket

import httplib2
import httpx
from google.auth.exceptions import GoogleAuthError
from google_auth_httplib2 import AuthorizedHttp
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from backend.core.config import Settings
from backend.core.exceptions import CalendarWriteError
from backend.core.google_auth import GoogleCredentialsProvider
from backend.models.calendar import CalendarEvent


class SingleAttemptHttp(httplib2.Http):
    """Adapter SDK bez ukrytych ponowień httplib2 po zerwaniu połączenia."""

    def request(self, uri, method="GET", body=None, headers=None, **kwargs):
        response = httpx.request(
            method, uri, content=body, headers=headers,
            timeout=self.timeout, follow_redirects=False,
        )
        metadata = dict(response.headers)
        metadata["status"] = str(response.status_code)
        metadata["reason"] = response.reason_phrase
        metadata.pop("content-encoding", None)  # httpx already decompresses content.
        metadata["content-length"] = str(len(response.content))
        return httplib2.Response(metadata), response.content


class GoogleCalendarClient:
    def __init__(self, settings: Settings, credentials: GoogleCredentialsProvider):
        self.settings = settings
        self.credentials = credentials
        self.service = None

    def authorize(self) -> None:
        credentials = self.credentials.get_credentials()
        transport = AuthorizedHttp(
            credentials, http=SingleAttemptHttp(timeout=self.settings.google_calendar_timeout),
            max_refresh_attempts=0,
        )
        # Bundled discovery document: no network call while constructing the client.
        self.service = build("calendar", "v3", http=transport, static_discovery=True, cache_discovery=False)

    def insert_event(self, event: CalendarEvent) -> dict:
        if self.service is None:
            raise RuntimeError("GoogleCalendarClient.authorize() must be called first")
        try:
            result = self.service.events().insert(
                calendarId=self.settings.google_calendar_id,
                body=event.model_dump(exclude_none=True),
            ).execute(num_retries=0)
        except HttpError as exc:
            status = exc.resp.status
            if status >= 500 or status == 408:
                raise CalendarWriteError("google_result_unknown", "Nie potwierdzono wyniku zapisu w Google.", "unknown") from exc
            code = "google_auth_required" if status == 401 else f"google_http_{status}"
            raise CalendarWriteError(code, f"Google odrzuciło zapis (HTTP {status}).") from exc
        except (GoogleAuthError, OSError, socket.timeout, http.client.HTTPException, httplib2.HttpLib2Error, httpx.HTTPError, ValueError, TypeError) as exc:
            raise CalendarWriteError("google_result_unknown", "Połączenie przerwane; wydarzenie mogło zostać zapisane.", "unknown") from exc
        if not isinstance(result, dict) or not result.get("id") or not result.get("htmlLink"):
            raise CalendarWriteError("google_result_unknown", "Odpowiedź Google nie potwierdza pełnego wyniku zapisu.", "unknown")
        return result
