"""Wspólna, walidowana konfiguracja z environment > .env > defaults."""

from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TXT_DIR = PROJECT_ROOT / "Data" / "TXT"
GROUND_TRUTH_DIR = PROJECT_ROOT / "Data" / "GroundTruth"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8",
        extra="ignore", populate_by_name=True,
    )

    ollama_host: AnyHttpUrl = Field("http://model:11434", validation_alias="OLLAMA_HOST")
    model_name: str = Field("qwen2.5:3b", min_length=1, validation_alias="NOTE2TASK_MODEL")
    ollama_timeout: float = Field(180, gt=0, validation_alias="OLLAMA_TIMEOUT")
    default_timezone: str = Field("Europe/Warsaw", validation_alias="DEFAULT_TIMEZONE")
    default_duration_minutes: int = Field(60, gt=0, validation_alias="DEFAULT_DURATION_MINUTES")
    api_port: int = Field(8000, ge=1, le=65535, validation_alias="NOTE2TASK_API_PORT")
    api_url: AnyHttpUrl | None = Field(None, validation_alias="NOTE2TASK_API_URL")

    @field_validator("default_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Niepoprawna strefa czasowa IANA.") from exc
        return value

    @field_validator("model_name")
    @classmethod
    def validate_model_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Nazwa modelu nie może być pusta.")
        return value

    @property
    def client_url(self) -> str:
        return str(self.api_url).rstrip("/") if self.api_url else f"http://localhost:{self.api_port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
