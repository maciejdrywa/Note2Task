"""Testy jednostkowe dla resolvera dat, godzin i transformacji struktur kalendarza."""

import datetime
from zoneinfo import ZoneInfo
import pytest

from backend.services.date_service import (
    parse_polish_time_expression,
    resolve_task_times,
    create_calendar_event,
    convert_to_ground_truth_format,
    resolve_event_date,
    parse_word_or_digit_hour,
)
from backend.models.calendar import ExtractedTaskRaw


def test_parse_exact_time():
    start, end, dur = parse_polish_time_expression("O 14.10")
    assert start == "14:10"
    assert end is None

    start, end, dur = parse_polish_time_expression("o 15:20")
    assert start == "15:20"


def test_parse_noon():
    start, end, dur = parse_polish_time_expression("w południe")
    assert start == "12:00"


def test_parse_midnight_and_hour_24():
    # 24:00 i dwudziesta czwarta mapowane na 00:00 bez błędu
    assert parse_word_or_digit_hour("24") == 0
    assert parse_word_or_digit_hour("dwudziesta czwarta") == 0
    assert parse_word_or_digit_hour("dwudziestej czwartej") == 0

    start, _, _ = parse_polish_time_expression("o 24")
    assert start == "00:00"

    start, _, _ = parse_polish_time_expression("o północy")
    assert start == "00:00"

    start, end, dur = parse_polish_time_expression("od 20 do 24")
    assert start == "20:00"
    assert end == "00:00"
    assert dur == 240


def test_parse_range():
    start, end, dur = parse_polish_time_expression("od 15 do 17")
    assert start == "15:00"
    assert end == "17:00"
    assert dur == 120


def test_parse_duration():
    start, end, dur = parse_polish_time_expression("o 12 na 2 godziny")
    assert start == "12:00"
    assert end == "14:00"
    assert dur == 120

    # Testy nowych wyrażeń czasu trwania
    _, _, dur1 = parse_polish_time_expression("na pół godziny")
    assert dur1 == 30

    _, _, dur2 = parse_polish_time_expression("przez 2 godziny")
    assert dur2 == 120

    _, _, dur3 = parse_polish_time_expression("na 1,5 godziny")
    assert dur3 == 90

    _, _, dur4 = parse_polish_time_expression("zajmie mi to 45 minut")
    assert dur4 == 45


def test_parse_relative_subtraction():
    start, _, _ = parse_polish_time_expression("kwadrans przed piętnastą")
    assert start == "14:45"

    start, _, _ = parse_polish_time_expression("20 minut przed dwudziestą nastawię pranie")
    assert start == "19:40"

    start, _, _ = parse_polish_time_expression("10 min przed 10")
    assert start == "09:50"

    # Z przedrostkiem "na"
    start, _, _ = parse_polish_time_expression("na kwadrans przed jedenastą")
    assert start == "10:45"


def test_parse_time_of_day_evening():
    # 5 minut po 20 wieczorem -> 20:05
    start, _, _ = parse_polish_time_expression("5 minut po 20 wieczorem")
    assert start == "20:05"

    # o 2 po południu -> 14:00
    start, _, _ = parse_polish_time_expression("o 2 po południu")
    assert start == "14:00"


def test_parse_half_past():
    start, _, _ = parse_polish_time_expression("wpół do dwudziestej drugiej")
    assert start == "21:30"

    start, _, _ = parse_polish_time_expression("wpół do 8")
    assert start == "07:30"


def test_parse_addition_word_boundary():
    # Słowo "po" nie może kolidować z przyimkiem "o"
    start, _, _ = parse_polish_time_expression("30 minut po 8")
    assert start == "08:30"

    start, _, _ = parse_polish_time_expression("5 minut po 13")
    assert start == "13:05"


def test_resolve_task_times_smart_fallback():
    # Smart Fallback: deterministyczny parser zwrócił pełną godzinę 20:00,
    # ale model LLM podał 20:05 - nie nadpisujemy minut z LLM!
    task = ExtractedTaskRaw(
        czynnosc="film",
        wyrazenie_czasu="o 20",
        godzina_start="20:05"
    )
    start, end, dur = resolve_task_times(task)
    assert start == "20:05"


def test_create_calendar_event_hour_24_safe():
    fixed_date = datetime.date(2026, 11, 20)
    task = ExtractedTaskRaw(
        czynnosc="pójść spać",
        wyrazenie_czasu="o 24:00 na 7 godzin",
        data_wzgledna="dzisiaj"
    )
    # Nie może rzucić ValueError: hour must be in 0..23
    event = create_calendar_event(task, base_date=fixed_date)
    assert event.start.dateTime.startswith("2026-11-21T00:00:00")
    assert event.end.dateTime.startswith("2026-11-21T07:00:00")


def test_resolve_event_date_relative_days():
    # Piątek: 2026-11-20
    base_date = datetime.date(2026, 11, 20)

    # Jutro -> sobota 2026-11-21
    assert resolve_event_date("jutro", base_date) == datetime.date(2026, 11, 21)

    # W weekend -> najbliższa sobota 2026-11-21
    assert resolve_event_date("w weekend", base_date) == datetime.date(2026, 11, 21)

    # W poniedziałek -> 2026-11-23
    assert resolve_event_date("w poniedziałek", base_date) == datetime.date(2026, 11, 23)

    # Za 3 dni -> 2026-11-23
    assert resolve_event_date("za 3 dni", base_date) == datetime.date(2026, 11, 23)


def test_convert_to_ground_truth_format():
    tasks_by_sentence = {
        "zdanie1": [
            ExtractedTaskRaw(czynnosc="kupić chleb", godzina_start="14:10"),
            ExtractedTaskRaw(czynnosc="pamiętać o zeszycie", godzina_start=None)
        ]
    }
    gt = convert_to_ground_truth_format(tasks_by_sentence)
    assert "zdanie1" in gt
    assert len(gt["zdanie1"]) == 2
    assert gt["zdanie1"][0] == {"czynność": "kupić chleb", "godzina": "14:10"}
    assert gt["zdanie1"][1] == {"czynność": "pamiętać o zeszycie", "godzina": None}
