"""Kontrakt /schedule oraz rzeczywisty transport SDK Google do lokalnego HTTP."""

from datetime import datetime, timedelta, timezone
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time

from fastapi.testclient import TestClient
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from google_auth_httplib2 import AuthorizedHttp
from googleapiclient.discovery import build_from_document
from googleapiclient.discovery_cache import get_static_doc
import pytest

from backend import cli
from backend.core.config import PROJECT_ROOT, Settings
from backend.core.dependencies import get_google_calendar_client, get_note_service
from backend.core.exceptions import GoogleAuthRequired, InvalidModelResponse
from backend.core.google_auth import GOOGLE_SCOPES, GoogleCredentialsProvider, save_credentials
from backend.clients.google_calendar import GoogleCalendarClient, SingleAttemptHttp
from backend.main import app
from backend.models.calendar import CalendarDateTime, CalendarEvent
from backend.tools import authorize_google


def event(hour=10):
    return CalendarEvent(
        summary="Kolacja z dziewczyną", description=None,
        start=CalendarDateTime(dateTime=f"2026-11-22T{hour:02}:00:00+01:00"),
        end=CalendarDateTime(dateTime=f"2026-11-22T{hour+1:02}:00:00+01:00"),
    )


def credentials():
    return Credentials(
        token="fake-access-token", refresh_token="fake-refresh-token",
        token_uri="https://oauth2.googleapis.com/token", client_id="fake-client-id",
        client_secret="fake-client-secret", scopes=GOOGLE_SCOPES,
        expiry=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
    )


@pytest.fixture
def google_server():
    state = {"calls": [], "statuses": [200], "delay": 0, "disconnect": False}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            state["calls"].append({"path": self.path, "body": data})
            number = len(state["calls"])
            status = state["statuses"][min(number - 1, len(state["statuses"]) - 1)]
            time.sleep(state["delay"])
            if state["disconnect"]:
                self.close_connection = True
                return
            body = state.get("raw_body") or json.dumps(
                {"id": f"event{number}", "htmlLink": f"https://calendar.google.com/event?eid={number}"}
                if status == 200 else {"error": {"code": status, "message": "Calendar request rejected"}}
            ).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    state["url"] = f"http://127.0.0.1:{server.server_port}/"
    yield state
    server.shutdown()
    server.server_close()
    thread.join()


@pytest.fixture
def schedule_client(google_server, tmp_path, monkeypatch):
    settings = Settings(_env_file=None, GOOGLE_TOKEN_FILE=tmp_path / "token.json")
    save_credentials(credentials(), settings.google_token_file)
    calendar = GoogleCalendarClient(settings, GoogleCredentialsProvider(settings))
    original_authorize = calendar.authorize

    def authorize():
        original_authorize()
        # Use the official SDK/discovery schema; only replace the upstream root URL.
        document = json.loads(get_static_doc("calendar", "v3"))
        document["rootUrl"] = google_server["url"]
        calendar.service = build_from_document(document, http=AuthorizedHttp(
            credentials(), http=SingleAttemptHttp(timeout=calendar.settings.google_calendar_timeout),
            max_refresh_attempts=0,
        ))

    monkeypatch.setattr(calendar, "authorize", authorize)

    class Notes:
        events = [event(10), event(19)]
        calls = 0
        error = None

        def process_text(self, text):
            self.calls += 1
            if self.error:
                raise self.error
            return self.events

    notes = Notes()
    app.dependency_overrides[get_google_calendar_client] = lambda: calendar
    app.dependency_overrides[get_note_service] = lambda: notes
    try:
        with TestClient(app) as client:
            yield client, notes, calendar
    finally:
        app.dependency_overrides.clear()


def test_schedule_creates_events_with_real_sdk_http(schedule_client, google_server, tmp_path, monkeypatch):
    client, notes, _ = schedule_client
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    response = client.post("/schedule", json={"text": "Jutro sklep i kolacja"})
    assert response.status_code == 200
    report = response.json()
    assert report["status"] == "completed"
    assert report["calendar_id"] == "primary"
    assert [r["status"] for r in report["results"]] == ["created", "created"]
    assert report["results"][0]["google_event_id"] == "event1"
    assert report["results"][0]["html_link"].startswith("https://calendar.google.com/")
    assert len(google_server["calls"]) == 2
    assert "/calendar/v3/calendars/primary/events" in google_server["calls"][0]["path"]
    assert google_server["calls"][0]["body"] == notes.events[0].model_dump(exclude_none=True)
    assert set(tmp_path.iterdir()) == before


@pytest.mark.parametrize("failure", [400, 401, 403, 404, 429])
def test_partial_failure_stops_remaining_requests(schedule_client, google_server, failure):
    client, notes, _ = schedule_client
    notes.events = [event(10), event(12), event(19)]
    google_server["statuses"] = [200, failure]
    response = client.post("/schedule", json={"text": "Trzy zadania"})
    assert response.status_code == 207
    assert response.json()["status"] == "partial"
    assert [r["status"] for r in response.json()["results"]] == ["created", "failed", "not_attempted"]
    assert len(google_server["calls"]) == 2


def test_503_is_unknown_and_not_retried(schedule_client, google_server):
    client, _, _ = schedule_client
    google_server["statuses"] = [503]
    response = client.post("/schedule", json={"text": "Sklep"})
    assert response.status_code == 207
    assert response.json()["status"] == "failed"
    assert [r["status"] for r in response.json()["results"]] == ["unknown", "not_attempted"]
    assert len(google_server["calls"]) == 1


def test_timeout_after_write_is_unknown(schedule_client, google_server):
    client, _, calendar = schedule_client
    calendar.settings.google_calendar_timeout = 0.02
    google_server["delay"] = 0.1
    response = client.post("/schedule", json={"text": "Sklep"})
    assert response.status_code == 207
    assert response.json()["results"][0]["status"] == "unknown"
    assert len(google_server["calls"]) == 1


def test_disconnect_is_not_retried(schedule_client, google_server):
    client, _, _ = schedule_client
    google_server["disconnect"] = True
    response = client.post("/schedule", json={"text": "Sklep"})
    assert response.status_code == 207
    assert response.json()["results"][0]["status"] == "unknown"
    assert len(google_server["calls"]) == 1


@pytest.mark.parametrize("body", [b"invalid-json", b'{}'])
def test_unparseable_success_response_has_unknown_outcome(schedule_client, google_server, body):
    client, _, _ = schedule_client
    google_server["raw_body"] = body
    response = client.post("/schedule", json={"text": "Sklep"})
    assert response.status_code == 207
    assert response.json()["results"][0]["status"] == "unknown"
    assert len(google_server["calls"]) == 1


def test_no_events_no_google_writes(schedule_client, google_server):
    client, notes, _ = schedule_client
    notes.events = []
    response = client.post("/schedule", json={"text": "Brak zadań"})
    assert response.status_code == 200
    assert response.json()["results"] == []
    assert not google_server["calls"]


@pytest.mark.parametrize("start,end", [
    ("not-a-date", "2026-11-22T11:00:00+01:00"),
    ("2026-11-22T10:00:00", "2026-11-22T11:00:00"),
    ("2026-11-22T12:00:00+01:00", "2026-11-22T11:00:00+01:00"),
])
def test_all_events_validated_before_first_write(schedule_client, google_server, start, end):
    client, notes, _ = schedule_client
    notes.events[1] = event(19)
    notes.events[1].start.dateTime = start
    notes.events[1].end.dateTime = end
    assert client.post("/schedule", json={"text": "Dwa zadania"}).status_code == 502
    assert not google_server["calls"]


def test_model_failure_and_invalid_input_do_not_write(schedule_client, google_server):
    client, notes, _ = schedule_client
    assert client.post("/schedule", json={"text": " "}).status_code == 422
    notes.error = InvalidModelResponse("Model error")
    assert client.post("/schedule", json={"text": "Sklep"}).status_code == 502
    assert not google_server["calls"]


def test_missing_token_fails_before_model(schedule_client, google_server):
    client, notes, calendar = schedule_client
    calendar.settings.google_token_file.unlink()
    response = client.post("/schedule", json={"text": "Sklep"})
    assert response.status_code == 503
    assert response.json()["code"] == "google_auth_required"
    assert notes.calls == 0
    assert not google_server["calls"]
    # /extract never consults Google credentials.
    assert client.post("/extract", json={"text": "Sklep"}).status_code == 200


def test_google_paths_relative_to_project():
    settings = Settings(_env_file=None)
    assert settings.google_token_file == PROJECT_ROOT / "secrets/google_token.json"


def test_expired_token_refreshed_and_persisted(tmp_path, monkeypatch):
    path = tmp_path / "token.json"
    token = credentials()
    token.expiry = datetime(2000, 1, 1)
    save_credentials(token, path)
    calls = []

    def refresh(self, request):
        calls.append(request.timeout)
        self.token = "refreshed-fake-token"
        self.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

    monkeypatch.setattr(Credentials, "refresh", refresh)
    provider = GoogleCredentialsProvider(Settings(_env_file=None, GOOGLE_TOKEN_FILE=path))
    assert provider.get_credentials().token == "refreshed-fake-token"
    assert calls == [15]
    assert json.loads(path.read_text())["token"] == "refreshed-fake-token"


def test_revoked_token_requires_authorization_without_leaking_errors(tmp_path, monkeypatch):
    path = tmp_path / "token.json"
    token = credentials()
    token.expiry = datetime(2000, 1, 1)
    save_credentials(token, path)

    def refresh(*args, **kwargs):
        raise RefreshError("Sensitive fake SDK detail")

    monkeypatch.setattr(Credentials, "refresh", refresh)
    with pytest.raises(GoogleAuthRequired) as error:
        GoogleCredentialsProvider(Settings(_env_file=None, GOOGLE_TOKEN_FILE=path)).get_credentials()
    assert "Sensitive" not in str(error.value)


@pytest.mark.parametrize("payload", ["bad-json", '{"token":"bad"}'])
def test_corrupt_token_requires_authorization(tmp_path, payload):
    path = tmp_path / "token.json"
    path.write_text(payload)
    with pytest.raises(GoogleAuthRequired):
        GoogleCredentialsProvider(Settings(_env_file=None, GOOGLE_TOKEN_FILE=path)).get_credentials()


def test_insufficient_scope_requires_authorization(tmp_path):
    path = tmp_path / "token.json"
    token = credentials()
    data = json.loads(token.to_json())
    data["scopes"] = ["https://www.googleapis.com/auth/calendar.events.readonly"]
    path.write_text(json.dumps(data))
    with pytest.raises(GoogleAuthRequired):
        GoogleCredentialsProvider(Settings(_env_file=None, GOOGLE_TOKEN_FILE=path)).get_credentials()


@pytest.mark.parametrize("status,exit_code", [("completed", 0), ("partial", 1), ("failed", 1)])
def test_cli_schedule_prints_report_and_exit_code(monkeypatch, capsys, status, exit_code):
    def urlopen(request, timeout):
        assert request.full_url.endswith("/schedule")
        return io.BytesIO(json.dumps({"calendar_id": "primary", "status": status, "results": []}).encode())

    monkeypatch.setattr(cli.urllib.request, "urlopen", urlopen)
    assert cli.main(["--schedule", "--text", "Sklep"]) == exit_code
    assert json.loads(capsys.readouterr().out)["status"] == status


def test_oauth_tool_uses_desktop_browser_pkce_and_saves_token(tmp_path, monkeypatch):
    settings = Settings(_env_file=None, GOOGLE_TOKEN_FILE=tmp_path / "token.json")
    captured = {}

    class Flow:
        def run_local_server(self, **kwargs):
            captured.update(kwargs)
            return credentials()

    def make_flow(path, **kwargs):
        assert kwargs["autogenerate_code_verifier"] is True
        assert kwargs["scopes"] == GOOGLE_SCOPES
        return Flow()

    monkeypatch.setattr(authorize_google, "get_settings", lambda: settings)
    monkeypatch.setattr(authorize_google.InstalledAppFlow, "from_client_secrets_file", make_flow)
    assert authorize_google.main() == 0
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 0
    assert captured["access_type"] == "offline"
    assert settings.google_token_file.exists()
