# Note2Task - Inteligentny Kalendarz

Projekt modułu NLP/LLM przekształcający nieustrukturyzowane notatki tekstowe w języku polskim na ustrukturyzowane wydarzenia kalendarzowe (Google Calendar API) oraz format ewaluacyjny.

Model bazowy: **`qwen2.5:3b`** (3.1B parametrów) działający lokalnie z akceleracją GPU (RTX 4050) za pośrednictwem **Ollama** (natywnie lub w Dockerze).

---

## Szybki Start z Dockerem

### 1. Uruchomienie serwera Ollama w kontenerze:
```bash
docker compose up -d
```
*(Kontener automatycznie montuje pobrane modele z hosta bez konieczności ponownego ich pobierania).*

Jeśli uruchamiasz projekt na nowym komputerze bez wcześniej pobranego modelu:
```bash
docker exec -it note2task-ollama ollama pull qwen2.5:3b
```

### 2. Instalacja zależności Pythona:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Użycie CLI

### Przetworzenie notatki z pliku:
```bash
python3 run.py --input Data/TXT/test.txt
```
Skrypt wygeneruje dwa pliki wyjściowe:
- `events_gcal.json` – format gotowy do bezpośredniego wstrzyknięcia do Google Calendar API (`summary`, `start`, `end`, `description`).
- `events_gt.json` – format kompatybilny ze zbiorem referencyjnym zespołu (`Data/GroundTruth/`).

### Przetworzenie tekstu podanego wprost:
```bash
python3 run.py --text "W piątek o 15:00 spotkanie z promotorem przez 45 minut, potem od 17 do 18:30 siłownia"
```

---

## Testy i Ewaluacja

### Uruchomienie testów jednostkowych:
```bash
pytest tests/ -v
```

### Uruchomienie benchmarku na zbiorze referencyjnym (30 plików):
```bash
python3 evaluate.py
```
Możesz ograniczyć liczbę plików do pierwszych 5:
```bash
python3 evaluate.py --limit 5
```
