"""Dane wejściowe API."""

from pydantic import BaseModel, Field, field_validator


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Notatka nie może być pusta.")
        return value
