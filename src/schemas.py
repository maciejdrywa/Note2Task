"""Modele i schematy danych dla Note2Task."""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ExtractedTaskRaw(BaseModel):
    """Surowe zadanie wyekstrahowane z tekstu przez model językowy."""
    czynnosc: str = Field(..., description="Znormalizowana nazwa czynności, np. 'kupić chleb', 'studia', 'trening na siłowni'")
    godzina_start: Optional[str] = Field(None, description="Godzina rozpoczęcia w formacie HH:MM (24h), np. '12:00', '14:10'")
    godzina_koniec: Optional[str] = Field(None, description="Godzina zakończenia w formacie HH:MM (24h), np. '14:00', '17:00'")
    czas_trwania_minuty: Optional[int] = Field(None, description="Czas trwania w minutach, np. 120 dla '2 godziny', 30 dla 'pół godziny'")
    wyrazenie_czasu: Optional[str] = Field(None, description="Dokładne wyrażenie czasowe z tekstu, np. '10 min przed 10', 'o 12 na 2 godziny'")
    opis: Optional[str] = Field(None, description="Dodatkowe uwagi lub kontekst, np. 'wziąć lekturę', 'kartkówka ze słówek'")
    data_wzgledna: Optional[str] = Field("dzisiaj", description="Względne określenie dnia, np. 'dzisiaj', 'jutro', 'w piątek'")


class CalendarDateTime(BaseModel):
    """Struktura znacznika czasu zgodna z Google Calendar API."""
    dateTime: str = Field(..., description="Data i godzina w formacie RFC3339 / ISO 8601, np. 2026-11-20T12:00:00+01:00")
    timeZone: str = Field("Europe/Warsaw", description="Identyfikator strefy czasowej IANA")


class CalendarEvent(BaseModel):
    """Pełny obiekt wydarzenia gotowy do przekazania do Google Calendar API."""
    summary: str = Field(..., description="Tytuł wydarzenia w kalendarzu")
    description: Optional[str] = Field(None, description="Opis lub notatka do wydarzenia")
    start: CalendarDateTime = Field(..., description="Czas rozpoczęcia wydarzenia")
    end: CalendarDateTime = Field(..., description="Czas zakończenia wydarzenia")


class GroundTruthTask(BaseModel):
    """Format zadania zgodny z istniejącym zbiorem Data/GroundTruth."""
    czynność: str
    godzina: str
