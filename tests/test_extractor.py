"""Test integracyjny i jednostkowy ekstraktora z lokalnym modelem Ollama."""

import pytest
from src.extractor import OllamaNoteExtractor, split_text_into_sentences


def test_split_sentences():
    text = "O 14.10 po szkole skoczyć po chleb. Potem o 18:00 siłownia."
    sentences = split_text_into_sentences(text)
    assert "zdanie1" in sentences
    assert "zdanie2" in sentences
    assert "14.10" in sentences["zdanie1"]
    assert "18:00" in sentences["zdanie2"]


def test_split_sentences_exclamation_question_and_newlines():
    text = "Ugotować obiad o 13:00!\nKupić bilet na pociąg?\nNastawić pranie o godz. 18.20."
    sentences = split_text_into_sentences(text)
    assert len(sentences) == 3
    assert "zdanie1" in sentences
    assert "zdanie2" in sentences
    assert "zdanie3" in sentences
    assert "Ugotować obiad" in sentences["zdanie1"]
    assert "Kupić bilet" in sentences["zdanie2"]
    assert "godz. 18.20" in sentences["zdanie3"]


def test_parse_raw_response_handles_list():
    extractor = OllamaNoteExtractor()
    # Gdy model zwróci listę zamiast słownika
    raw_list = [
        {"czynnosc": "iść na spacer", "godzina_start": "16:00"}
    ]
    parsed = extractor._parse_raw_response(raw_list, ["zdanie1"])
    assert "zdanie1" in parsed
    assert len(parsed["zdanie1"]) == 1
    assert parsed["zdanie1"][0].czynnosc == "iść na spacer"
    assert parsed["zdanie1"][0].godzina_start == "16:00"


def test_extractor_user_phrase():
    extractor = OllamaNoteExtractor()
    phrase = "ide na studia o 12 na 2 godziny. Potem ide na silownie od 15 do 17"
    results = extractor.extract_from_text(phrase)

    assert "zdanie1" in results or "zdanie2" in results
    all_tasks = [t for tasks in results.values() for t in tasks]
    assert len(all_tasks) >= 2

    # Sprawdzenie obecności kluczowych aktywności
    activities = [t.czynnosc.lower() for t in all_tasks]
    assert any("studia" in a for a in activities)
    assert any("siłowni" in a or "silowni" in a for a in activities)
