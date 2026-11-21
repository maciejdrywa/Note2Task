"""Kontrakt API i konsoli; odpowiedzi Ollamy podawane przez lokalny HTTP."""

import io
import datetime
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
import urllib.error

from fastapi.testclient import TestClient
import pytest

from backend import main as api, cli
from backend.services.note_service import NoteService
from backend.services.extraction_service import ExtractionService
from backend.clients.ollama import OllamaClient
from backend.core.config import Settings
from backend.core.dependencies import get_ollama_client
from backend.services import note_service as pipeline_module
from backend.models.calendar import ExtractedTaskRaw


@pytest.fixture
def ollama_server():
    state = {"status": 200, "delay": 0, "calls": [], "content": {"zdanie1": [
        {"czynnosc": "sklep", "godzina_start": "10:00", "data_wzgledna": "jutro"}
    ]}}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            body = json.dumps({"models": state.get("models", [{"name": "qwen2.5:3b"}])}).encode()
            self.send_response(state["status"])
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            state["calls"].append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            time.sleep(state["delay"])
            body = state.get("body", json.dumps({"message": {"content": json.dumps(state["content"])}}).encode())
            self.send_response(state["status"])
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    state["url"] = f"http://127.0.0.1:{server.server_port}"
    yield state
    server.shutdown()
    server.server_close()
    thread.join()


@pytest.fixture
def client(monkeypatch, ollama_server):
    transport = OllamaClient(ollama_server["url"], "qwen2.5:3b", 180)
    ollama_server["client"] = transport
    api.app.dependency_overrides[get_ollama_client] = lambda: transport
    try:
        with TestClient(api.app) as client:
            yield client
    finally:
        api.app.dependency_overrides.clear()


def test_extract_returns_calendar_json_without_files(client, ollama_server, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    response = client.post("/extract", json={"text": "Jutro o 10 idę do sklepu."})
    assert response.status_code == 200
    event = response.json()[0]
    assert event["summary"] == "Sklep"
    assert event["start"]["dateTime"].endswith(("10:00:00+01:00", "10:00:00+02:00"))
    assert event["end"]["dateTime"].endswith(("11:00:00+01:00", "11:00:00+02:00"))
    assert event["start"]["timeZone"] == "Europe/Warsaw"
    assert list(tmp_path.iterdir()) == []
    assert len(ollama_server["calls"]) == 1
    assert ollama_server["calls"][0]["model"] == "qwen2.5:3b"
    assert ollama_server["calls"][0]["stream"] is False


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "  \n"}, {"text": None}])
def test_empty_text_is_rejected(client, payload, ollama_server):
    assert client.post("/extract", json=payload).status_code == 422
    assert not ollama_server["calls"]


def test_valid_no_tasks(client, ollama_server):
    ollama_server["content"] = {"zdanie1": []}
    response = client.post("/extract", json={"text": "To tylko notatka."})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize("content", [None, {}, {"zdanie1": "bad"}, {"zdanie1": [5]},
    {"zdanie1": [{"czynnosc": ""}]}, {"zdanie1": [{"czynnosc": "sklep", "godzina_start": "30:80"}]}])
def test_invalid_model_data_is_502(client, ollama_server, content):
    ollama_server["content"] = content
    assert client.post("/extract", json={"text": "Sklep."}).status_code == 502


def test_invalid_ollama_json_is_502(client, ollama_server):
    ollama_server["body"] = b"not json"
    assert client.post("/extract", json={"text": "Sklep."}).status_code == 502


@pytest.mark.parametrize("status", [404, 500])
def test_ollama_http_error_is_503(client, ollama_server, status):
    ollama_server["status"] = status
    assert client.post("/extract", json={"text": "Sklep."}).status_code == 503
    assert len(ollama_server["calls"]) == 1


def test_unreachable_ollama_is_503(client, monkeypatch, ollama_server):
    server = ThreadingHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
    port = server.server_port
    server.server_close()
    monkeypatch.setattr(ollama_server["client"], "host", f"http://127.0.0.1:{port}")
    assert client.post("/extract", json={"text": "Sklep."}).status_code == 503


def test_timeout_is_504_without_retry(client, ollama_server, monkeypatch):
    ollama_server["delay"] = 0.1
    monkeypatch.setattr(ollama_server["client"], "timeout", 0.02)
    assert client.post("/extract", json={"text": "Sklep."}).status_code == 504
    assert len(ollama_server["calls"]) == 1


def test_health_checks_model(client, ollama_server):
    assert client.get("/health").json() == {"status": "ok", "model": "qwen2.5:3b"}
    ollama_server["models"] = []
    assert client.get("/health").status_code == 503


def test_relative_date_uses_warsaw_at_midnight(monkeypatch):
    class Clock(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            assert str(tz) == "Europe/Warsaw"
            return cls(2026, 11, 21, 0, 30, tzinfo=tz)

    settings = Settings(_env_file=None)
    pipeline = NoteService(ExtractionService(OllamaClient(str(settings.ollama_host), settings.model_name, settings.ollama_timeout)), settings)
    monkeypatch.setattr(pipeline_module.datetime, "datetime", Clock)
    monkeypatch.setattr(pipeline.extractor, "extract_from_text", lambda text: {
        "zdanie1": [ExtractedTaskRaw(czynnosc="sklep", godzina_start="10:00", data_wzgledna="jutro")]
    })
    event = pipeline.process_text("Jutro sklep")[0]
    assert event.start.dateTime == "2026-11-22T10:00:00+01:00"


def test_cli_only_outputs_json(monkeypatch, capsys, tmp_path):
    def urlopen(request, timeout):
        assert json.loads(request.data) == {"text": "Kolacja z dziewczyną"}
        assert request.full_url == "http://localhost:8000/extract"
        assert timeout == 200
        return io.BytesIO('[{"summary":"Kolacja"}]'.encode())

    monkeypatch.setattr(cli.urllib.request, "urlopen", urlopen)
    monkeypatch.chdir(tmp_path)
    assert cli.main(["--text", "Kolacja z dziewczyną", "--url", "http://localhost:8000"]) == 0
    output = capsys.readouterr()
    assert json.loads(output.out) == [{"summary": "Kolacja"}]
    assert output.err == ""
    assert list(tmp_path.iterdir()) == []


def test_cli_input_file_and_interactive_enter(monkeypatch, capsys, tmp_path):
    notes = []

    def urlopen(request, timeout):
        notes.append(json.loads(request.data)["text"])
        return io.BytesIO(b"[]")

    monkeypatch.setattr(cli.urllib.request, "urlopen", urlopen)
    path = tmp_path / "note.txt"
    path.write_text("Jutro sklep", encoding="utf-8-sig")
    assert cli.main(["--input", str(path)]) == 0
    monkeypatch.setattr(cli.sys, "stdin", type("Terminal", (), {"isatty": lambda self: True})())
    monkeypatch.setattr("builtins.input", lambda: "Kolacja")
    assert cli.main([]) == 0
    assert notes == ["Jutro sklep", "Kolacja"]
    assert "Podaj notatkę" in capsys.readouterr().err


@pytest.mark.parametrize("error", [urllib.error.URLError("offline"), TimeoutError("timeout"),
    urllib.error.HTTPError("http://localhost", 503, "offline", {}, io.BytesIO(b'{"detail":"offline"}'))])
def test_cli_failure_has_no_stdout(monkeypatch, capsys, error):
    def urlopen(*args, **kwargs):
        raise error

    monkeypatch.setattr(cli.urllib.request, "urlopen", urlopen)
    assert cli.main(["--text", "Sklep"]) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert "Błąd" in output.err
