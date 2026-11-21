"""Moduł rozwiązywania dat, godzin i generowania formatów kalendarzowych."""

import datetime
import re
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from backend.core.config import get_settings
from backend.models.calendar import CalendarDateTime, CalendarEvent, ExtractedTaskRaw, GroundTruthTask

# Słownik polskich liczebników głównych i ułamkowych na wartości liczbowe
POLISH_NUMBERS = {
    "zero": 0, "jeden": 1, "dwa": 2, "trzy": 3, "cztery": 4, "pięć": 5,
    "sześć": 6, "siedem": 7, "osiem": 8, "dziewięć": 9, "dziesięć": 10,
    "jedenaście": 11, "dwanaście": 12, "trzynaście": 13, "czternaście": 14,
    "piętnaście": 15, "kwadrans": 15, "szesnaście": 16, "siedemnaście": 17,
    "osiemnaście": 18, "dziewiętnaście": 19, "dwadzieścia": 20,
    "dwadzieścia pięć": 25, "trzydzieści": 30, "pół": 30, "wpół": 30,
    "czterdzieści": 40, "czterdzieści pięć": 45, "pięćdziesiąt": 50,
}

POLISH_ORDINAL_HOURS = {
    "pierwsza": 1, "pierwszej": 1, "pierwszą": 1,
    "druga": 2, "drugiej": 2, "drugą": 2,
    "trzecia": 3, "trzeciej": 3, "trzecią": 3,
    "czwarta": 4, "czwartej": 4, "czwartą": 4,
    "piąta": 5, "piątej": 5, "piątą": 5,
    "szósta": 6, "szóstej": 6, "szóstą": 6,
    "siódma": 7, "siódmej": 7, "siódmą": 7,
    "ósma": 8, "ósmej": 8, "ósmą": 8,
    "dziewiąta": 9, "dziewiątej": 9, "dziewiątą": 9,
    "dziesiąta": 10, "dziesiątej": 10, "dziesiątą": 10,
    "jedenasta": 11, "jedenastej": 11, "jedenastą": 11,
    "dwunasta": 12, "dwunastej": 12, "dwunastą": 12,
    "trzynasta": 13, "trzynastej": 13, "trzynastą": 13,
    "czternasta": 14, "czternastej": 14, "czternastą": 14,
    "piętnasta": 15, "piętnastej": 15, "piętnastą": 15,
    "szesnasta": 16, "szesnastej": 16, "szesnastą": 16,
    "siedemnasta": 17, "siedemnastej": 17, "siedemnastą": 17,
    "osiemnasta": 18, "osiemnastej": 18, "osiemnastą": 18,
    "dziewiętnasta": 19, "dziewiętnastej": 19, "dziewiętnastą": 19,
    "dwudziesta": 20, "dwudziestej": 20, "dwudziestą": 20,
    "dwudziesta pierwsza": 21, "dwudziestej pierwszej": 21, "dwudziestą pierwszą": 21,
    "dwudziesta druga": 22, "dwudziestej drugiej": 22, "dwudziestą drugą": 22,
    "dwudziesta trzecia": 23, "dwudziestej trzeciej": 23, "dwudziestą trzecią": 23,
    "dwudziesta czwarta": 0, "dwudziestej czwartej": 0, "dwudziestą czwartą": 0,
    "północ": 0, "północy": 0, "południe": 12, "południu": 12
}

# Precyzyjny wzorzec generowany z kluczy słownika zapobiegający literówkom i zachłanności
_sorted_hour_keys = sorted(POLISH_ORDINAL_HOURS.keys(), key=len, reverse=True)
ORDINAL_HOUR_PATTERN = r"(?:" + "|".join(re.escape(k) for k in _sorted_hour_keys) + r"|\d{1,2})"
DELTA_PATTERN = r"(?:na\s+)?(kwadrans|pół|\d+|[a-ząćęłńóśźż]+(?:\s+pięć)?)\s*(?:min(?:ut[y]?)?)?"


def parse_word_or_digit_hour(token: str) -> Optional[int]:
    """Konwertuje słowną lub cyfrową reprezentację godziny na liczbę 0-23."""
    clean = token.strip().lower()
    if clean.isdigit():
        val = int(clean)
        if val == 24:
            return 0
        return val if 0 <= val < 24 else None
    val = POLISH_ORDINAL_HOURS.get(clean)
    if val == 24:
        return 0
    return val


def parse_word_or_digit_minutes(token: str) -> Optional[int]:
    """Konwertuje słowną lub cyfrową reprezentację minut na liczbę."""
    clean = token.strip().lower()
    clean = re.sub(r"\s*min(ut[y]?)?$", "", clean).strip()
    if clean.isdigit():
        return int(clean)
    return POLISH_NUMBERS.get(clean)


def parse_polish_time_expression(expr: str) -> Tuple[Optional[str], Optional[str], Optional[int]]:
    """
    Deterministyczny parser polskich wyrażeń czasowych.
    Zwraca krotkę: (godzina_start HH:MM, godzina_koniec HH:MM, czas_trwania_minuty)
    """
    if not expr:
        return None, None, None

    text = expr.lower().strip()
    is_evening = bool(re.search(r"\b(po\s+południu|wieczor(?:em)?)\b", text))

    # Specjalne słowa: południe / północ
    if "południe" in text and not re.search(r"\bpo\s+południu\b", text):
        return "12:00", None, None
    if "północ" in text:
        return "00:00", None, None

    # Ekstrakcja samego czasu trwania
    m_dur_standalone = None
    if re.search(r"\bna\s+(?:półtorej|1[,.]5)\s*godzin", text):
        m_dur_standalone = 90
    elif re.search(r"\bna\s+pół\s*godziny\b", text):
        m_dur_standalone = 30
    elif re.search(r"\bna\s+kwadrans\b", text):
        m_dur_standalone = 15
    else:
        m_span = re.search(r"\b(?:przez|zajmie\s+(?:mi\s+)?to)\s+(\d+|jeden|dwa|trzy|cztery|pięć)\s*(godzin[ye]?|godz\b|h\b|minut[y]?|min\b)", text)
        if m_span:
            raw_v = m_span.group(1)
            v = int(raw_v) if raw_v.isdigit() else POLISH_NUMBERS.get(raw_v, 1)
            unit = m_span.group(2)
            m_dur_standalone = v * 60 if ("godz" in unit or "h" in unit) else v

    # Zakresy: "od X do Y" (np. "od 15 do 17", "od 8:00 do 9:30", "od 20 do 24")
    m_range = re.search(r"od\s+([0-2]?\d(?:[:.]\d{2})?)\s+do\s+([0-2]?\d(?:[:.]\d{2})?)", text)
    if m_range:
        start_str = m_range.group(1).replace(".", ":")
        end_str = m_range.group(2).replace(".", ":")
        if ":" not in start_str:
            sh_val = int(start_str)
            if sh_val == 24:
                sh_val = 0
            if is_evening and 1 <= sh_val <= 11:
                sh_val += 12
            start_str = f"{sh_val:02d}:00"
        else:
            h, m = start_str.split(":")
            sh_val = int(h)
            if sh_val == 24:
                sh_val = 0
            if is_evening and 1 <= sh_val <= 11:
                sh_val += 12
            start_str = f"{sh_val:02d}:{int(m):02d}"

        if ":" not in end_str:
            eh_val = int(end_str)
            if eh_val == 24:
                eh_val = 0
            if is_evening and 1 <= eh_val <= 11:
                eh_val += 12
            end_str = f"{eh_val:02d}:00"
        else:
            h, m = end_str.split(":")
            eh_val = int(h)
            if eh_val == 24:
                eh_val = 0
            if is_evening and 1 <= eh_val <= 11:
                eh_val += 12
            end_str = f"{eh_val:02d}:{int(m):02d}"

        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))
        duration = (eh * 60 + em) - (sh * 60 + sm)
        if duration <= 0:
            duration += 24 * 60
        return start_str, end_str, duration

    # Czas trwania z godziną startową: "o X na Y godzin / minut"
    m_dur = re.search(r"(?:\bo\b|\bgodz\.?)\s*([0-2]?\d(?:[:.]\d{2})?)\s+na\s+([0-9]+|półtorej|1[,.]5|pół|kwadrans)\s*(godzin[ye]?|godz\b|h\b|minut[y]?|min\b)?", text)
    if m_dur:
        start_raw = m_dur.group(1).replace(".", ":")
        if ":" not in start_raw:
            sh_val = int(start_raw)
            if sh_val == 24:
                sh_val = 0
            if is_evening and 1 <= sh_val <= 11:
                sh_val += 12
            start_str = f"{sh_val:02d}:00"
        else:
            h, m = start_raw.split(":")
            sh_val = int(h)
            if sh_val == 24:
                sh_val = 0
            if is_evening and 1 <= sh_val <= 11:
                sh_val += 12
            start_str = f"{sh_val:02d}:{int(m):02d}"

        amount_token = m_dur.group(2)
        unit = m_dur.group(3) or ""
        if amount_token in ("półtorej", "1,5", "1.5"):
            duration_minutes = 90
        elif amount_token == "pół":
            duration_minutes = 30
        elif amount_token == "kwadrans":
            duration_minutes = 15
        else:
            amount = int(amount_token)
            if "godz" in unit or "h" in unit:
                duration_minutes = amount * 60
            else:
                duration_minutes = amount

        sh, sm = map(int, start_str.split(":"))
        total_m = sh * 60 + sm + duration_minutes
        end_h = (total_m // 60) % 24
        end_m = total_m % 60
        end_str = f"{end_h:02d}:{end_m:02d}"
        return start_str, end_str, duration_minutes

    # "wpół do Y" (np. "wpół do dwudziestej drugiej", "wpół do 8")
    m_half = re.search(r"\bw\s*p[óo]ł\s+do\s+(" + ORDINAL_HOUR_PATTERN + r")\b", text)
    if m_half:
        target_token = m_half.group(1).strip()
        hour_val = parse_word_or_digit_hour(target_token)
        if hour_val is not None:
            if is_evening and 1 <= hour_val <= 11:
                hour_val += 12
            h = (hour_val - 1) % 24
            return f"{h:02d}:30", None, m_dur_standalone

    # "X minut przed Y" lub "kwadrans przed Y"
    m_before = re.search(DELTA_PATTERN + r"\s+przed\s+(" + ORDINAL_HOUR_PATTERN + r")\b", text)
    if m_before:
        min_token = m_before.group(1).strip()
        hour_token_raw = m_before.group(2).strip()
        delta_m = parse_word_or_digit_minutes(min_token)
        base_h = parse_word_or_digit_hour(hour_token_raw)

        if delta_m is not None and base_h is not None:
            if is_evening and 1 <= base_h <= 11:
                base_h += 12
            total_minutes = base_h * 60 - delta_m
            final_h = (total_minutes // 60) % 24
            final_m = total_minutes % 60
            return f"{final_h:02d}:{final_m:02d}", None, m_dur_standalone

    # "X minut po Y" lub "kwadrans po Y"
    m_after = re.search(DELTA_PATTERN + r"\s+po\s+(" + ORDINAL_HOUR_PATTERN + r")\b", text)
    if m_after:
        min_token = m_after.group(1).strip()
        hour_token_raw = m_after.group(2).strip()

        # Ignoruj idiom "po południu" (w godzinach popołudniowych), chyba że jawnie podano jednostkę minut
        is_po_poludniu_idiom = hour_token_raw.startswith("południ") and not re.search(r"\bmin(?:ut[y]?)?\b", text)
        if not is_po_poludniu_idiom:
            delta_m = parse_word_or_digit_minutes(min_token)
            base_h = parse_word_or_digit_hour(hour_token_raw)

            if delta_m is not None and base_h is not None:
                if is_evening and 1 <= base_h <= 11:
                    base_h += 12
                total_minutes = base_h * 60 + delta_m
                final_h = (total_minutes // 60) % 24
                final_m = total_minutes % 60
                return f"{final_h:02d}:{final_m:02d}", None, m_dur_standalone

    # Standardowe zapisy czasu: "14:10", "14.10"
    m_exact = re.search(r"\b([0-2]?\d)[:.]([0-5]\d)\b", text)
    if m_exact:
        eh_val = int(m_exact.group(1))
        em_val = int(m_exact.group(2))
        if eh_val == 24:
            eh_val = 0
        if is_evening and 1 <= eh_val <= 11:
            eh_val += 12
        return f"{eh_val:02d}:{em_val:02d}", None, m_dur_standalone

    # Pojedyncza godzina: "o 12", "godz. 17", "o 2 po południu" (z precyzyjną granicą słowa \bo\b)
    m_simple_h = re.search(r"(?:\bo\b|\bgodz\.?)\s*([0-2]?\d)\b", text)
    if m_simple_h:
        h = int(m_simple_h.group(1))
        if h == 24:
            h = 0
        if is_evening and 1 <= h <= 11:
            h += 12
        if 0 <= h < 24:
            return f"{h:02d}:00", None, m_dur_standalone

    if m_dur_standalone:
        return None, None, m_dur_standalone

    return None, None, None


def resolve_task_times(task: ExtractedTaskRaw, default_duration_min: Optional[int] = None) -> Tuple[str, str, int]:
    """
    Ustala ostateczną godzinę rozpoczęcia, zakończenia oraz czas trwania zadania.
    Łączy predykcję LLM ze strażnikiem deterministycznym, stosując Smart Fallback.
    """
    if default_duration_min is None:
        default_duration_min = get_settings().default_duration_minutes
    parsed_start, parsed_end, parsed_duration = parse_polish_time_expression(task.wyrazenie_czasu or "")

    # Smart Fallback: Jeśli deterministyczny parser zwrócił pełną godzinę (np. "20:00"),
    # ale model LLM wskazał dokładniejsze minuty na podstawie kontekstu (np. "20:05"),
    # nie nadpisujemy ślepo wyniku LLM ułomnym regexem!
    start_time = None
    if parsed_start and task.godzina_start:
        p_parts = parsed_start.split(":")
        l_cleaned = task.godzina_start.replace(".", ":")
        if ":" in l_cleaned:
            l_parts = l_cleaned.split(":")
            if int(p_parts[0]) == int(l_parts[0]) and p_parts[1] == "00" and l_parts[1] != "00":
                start_time = f"{int(l_parts[0]):02d}:{int(l_parts[1]):02d}"

    if not start_time:
        start_time = parsed_start or task.godzina_start or "12:00"

    # Upewnij się, że start_time ma format HH:MM oraz nie ma godziny 24
    if ":" in start_time:
        parts = start_time.split(":")
        sh = int(parts[0])
        if sh == 24:
            sh = 0
        start_time = f"{sh:02d}:{int(parts[1]):02d}"
    elif start_time.isdigit():
        sh = int(start_time)
        if sh == 24:
            sh = 0
        start_time = f"{sh:02d}:00"

    # Wybór czasu trwania i godziny zakończenia
    duration_min = parsed_duration or task.czas_trwania_minuty
    end_time = parsed_end or task.godzina_koniec
    if end_time:
        end_time = end_time.replace(".", ":")
        if ":" in end_time:
            eh_p, em_p = end_time.split(":")
            eh = int(eh_p)
            if eh == 24:
                eh = 0
            end_time = f"{eh:02d}:{int(em_p):02d}"

    sh, sm = map(int, start_time.split(":"))

    if end_time and not duration_min:
        eh, em = map(int, end_time.split(":"))
        duration_min = (eh * 60 + em) - (sh * 60 + sm)
        if duration_min <= 0:
            duration_min += 24 * 60
    elif duration_min and not end_time:
        total = sh * 60 + sm + duration_min
        end_time = f"{(total // 60) % 24:02d}:{total % 60:02d}"
    elif not end_time and not duration_min:
        duration_min = default_duration_min
        total = sh * 60 + sm + duration_min
        end_time = f"{(total // 60) % 24:02d}:{total % 60:02d}"

    return start_time, end_time, duration_min


def resolve_event_date(relative_str: Optional[str], base_date: Optional[datetime.date] = None) -> datetime.date:
    """Rozwiązuje datę względną (np. 'dzisiaj', 'jutro', 'pojutrze', 'w piątek', 'w weekend', 'za 3 dni') względem daty bazowej."""
    if base_date is None:
        base_date = datetime.datetime.now(ZoneInfo(get_settings().default_timezone)).date()

    if not relative_str:
        return base_date

    clean = relative_str.lower().strip()
    if "jutro" in clean:
        return base_date + datetime.timedelta(days=1)
    if "pojutrze" in clean:
        return base_date + datetime.timedelta(days=2)
    if "weekend" in clean:
        # Najbliższa sobota (weekday 5)
        days_ahead = (5 - base_date.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        return base_date + datetime.timedelta(days=days_ahead)

    # Dni tygodnia
    weekdays_pl = {
        "poniedział": 0, "wtork": 1, "środ": 2, "srod": 2,
        "czwart": 3, "piąt": 4, "piat": 4, "sobot": 5, "niedziel": 6
    }
    for stem, target_wd in weekdays_pl.items():
        if stem in clean:
            days_ahead = (target_wd - base_date.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return base_date + datetime.timedelta(days=days_ahead)

    # Za X dni
    m_days = re.search(r"za\s+(\d+|jeden|dwa|trzy|cztery|pięć)\s+dn[ia]", clean)
    if m_days:
        raw_val = m_days.group(1)
        val = int(raw_val) if raw_val.isdigit() else POLISH_NUMBERS.get(raw_val, 1)
        return base_date + datetime.timedelta(days=val)

    return base_date


def create_calendar_event(
    task: ExtractedTaskRaw,
    base_date: Optional[datetime.date] = None,
    time_zone: Optional[str] = None,
    default_duration_min: Optional[int] = None
) -> CalendarEvent:
    """Tworzy pełny obiekt CalendarEvent gotowy dla Google Calendar API."""
    if time_zone is None:
        time_zone = get_settings().default_timezone
    start_time_str, end_time_str, _ = resolve_task_times(task, default_duration_min)
    event_date = resolve_event_date(task.data_wzgledna, base_date)

    sh, sm = map(int, start_time_str.split(":"))
    eh, em = map(int, end_time_str.split(":"))

    # Wykrycie, czy godzina startowa została zdefiniowana jako 24:00 (przejście na 00:00 kolejnego dnia)
    is_start_24 = False
    if task.godzina_start in ("24", "24:00"):
        is_start_24 = True
    elif task.wyrazenie_czasu and re.search(r"(?:\bo\b|\bgodz\.?)\s*24(?::00)?\b|dwudziest[aąej]\s+czwart[aąej]", task.wyrazenie_czasu.lower()):
        is_start_24 = True

    if is_start_24 or sh >= 24:
        sh = 0
        event_date = event_date + datetime.timedelta(days=1)

    tz = ZoneInfo(time_zone)
    start_dt = datetime.datetime(event_date.year, event_date.month, event_date.day, sh, sm, tzinfo=tz)

    end_date = event_date
    if eh >= 24:
        eh = 0
        end_date = event_date + datetime.timedelta(days=1)
    elif (eh * 60 + em) <= (sh * 60 + sm):
        end_date = event_date + datetime.timedelta(days=1)

    end_dt = datetime.datetime(end_date.year, end_date.month, end_date.day, eh, em, tzinfo=tz)

    summary = task.czynnosc.strip()
    if summary:
        summary = summary[0].upper() + summary[1:]

    return CalendarEvent(
        summary=summary,
        description=task.opis,
        start=CalendarDateTime(dateTime=start_dt.isoformat(), timeZone=time_zone),
        end=CalendarDateTime(dateTime=end_dt.isoformat(), timeZone=time_zone)
    )


def convert_to_ground_truth_format(tasks_by_sentence: Dict[str, List[ExtractedTaskRaw]]) -> Dict[str, List[dict]]:
    """Konwertuje wyekstrahowane zadania do formatu zgodnego z Data/GroundTruth/*.json."""
    gt_dict = {}
    for sentence_key, tasks in tasks_by_sentence.items():
        items = []
        for task in tasks:
            parsed_start, _, _ = parse_polish_time_expression(task.wyrazenie_czasu or "")
            start_time = parsed_start or task.godzina_start
            if start_time:
                if ":" in start_time:
                    parts = start_time.split(":")
                    sh = int(parts[0])
                    if sh == 24:
                        sh = 0
                    start_time = f"{sh:02d}:{int(parts[1]):02d}"
                elif start_time.isdigit():
                    sh = int(start_time)
                    if sh == 24:
                        sh = 0
                    start_time = f"{sh:02d}:00"
            else:
                start_time = None

            items.append({
                "czynność": task.czynnosc,
                "godzina": start_time
            })
        gt_dict[sentence_key] = items
    return gt_dict
