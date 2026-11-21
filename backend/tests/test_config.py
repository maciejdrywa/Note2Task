"""Konfiguracja lokalna, walidacja i zastosowanie ustawień przez serwisy."""

import datetime
from pathlib import Path

from pydantic import ValidationError
import pytest

from backend.clients.ollama import OllamaClient
from backend.core.config import PROJECT_ROOT, Settings, get_settings
from backend.models.calendar import ExtractedTaskRaw
from backend.services.extraction_service import ExtractionService
from backend.services.note_service import NoteService


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch):
    for field in Settings.model_fields.values():
        monkeypatch.delenv(field.validation_alias, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_environment_overrides_dotenv_overrides_defaults(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("NOTE2TASK_MODEL=from-file\nOLLAMA_TIMEOUT=91\nFUTURE_SECRET=unused\n", encoding="utf-8")
    monkeypatch.setenv("NOTE2TASK_MODEL", "from-environment")
    settings = Settings(_env_file=path)
    assert settings.model_name == "from-environment"
    assert settings.ollama_timeout == 91
    assert settings.default_duration_minutes == 60


def test_dotenv_location_independent_of_working_directory(tmp_path, monkeypatch):
    assert Settings.model_config["env_file"] == PROJECT_ROOT / ".env"
    assert PROJECT_ROOT / "backend" == Path(__file__).resolve().parents[1]
    expected = get_settings().model_name
    get_settings.cache_clear()
    monkeypatch.chdir(tmp_path)
    assert get_settings().model_name == expected


@pytest.mark.parametrize("values", [
    {"OLLAMA_HOST": "not-a-url"}, {"OLLAMA_TIMEOUT": 0},
    {"DEFAULT_TIMEZONE": "Unknown/Zone"}, {"DEFAULT_DURATION_MINUTES": -1},
    {"NOTE2TASK_API_PORT": 70000}, {"NOTE2TASK_MODEL": "  "},
    {"NOTE2TASK_API_URL": "broken-url"},
])
def test_invalid_configuration_rejected(values):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)


def test_client_url_tracks_configured_port():
    settings = Settings(_env_file=None, NOTE2TASK_API_PORT=8001)
    assert settings.client_url == "http://localhost:8001"
    assert Settings(_env_file=None, NOTE2TASK_API_URL="http://example.test:9000").client_url == "http://example.test:9000"


def test_note_service_uses_duration_and_timezone(monkeypatch):
    settings = Settings(_env_file=None, DEFAULT_DURATION_MINUTES=45, DEFAULT_TIMEZONE="UTC")
    extractor = ExtractionService(OllamaClient(str(settings.ollama_host), settings.model_name, settings.ollama_timeout))
    monkeypatch.setattr(extractor, "extract_from_text", lambda text: {"zdanie1": [ExtractedTaskRaw(czynnosc="sklep")]})
    event = NoteService(extractor, settings).process_text("Sklep") [0]
    assert event.start.timeZone == "UTC"
    start = datetime.datetime.fromisoformat(event.start.dateTime)
    end = datetime.datetime.fromisoformat(event.end.dateTime)
    assert start.hour == 12
    assert end - start == datetime.timedelta(minutes=45)
