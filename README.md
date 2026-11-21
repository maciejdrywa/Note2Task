# Note2Task - Intelligent Calendar

An NLP/LLM module that converts unstructured Polish text notes into structured calendar events (Google Calendar API) and an evaluation format.

Base model: **`qwen2.5:3b`** (3.1B parameters), running locally with GPU acceleration (RTX 4050) through **Ollama** (natively or in Docker).

---

## Quick Start with Docker

### 1. Start the Ollama server in a container:
```bash
docker compose up -d
```
*(The container automatically mounts models downloaded on the host, so they do not need to be downloaded again.)*

If you are running the project on a new computer without the model already downloaded:
```bash
docker exec -it note2task-ollama ollama pull qwen2.5:3b
```

### 2. Install Python dependencies:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## CLI Usage

### Process a note from a file:
```bash
python3 run.py --input Data/TXT/test.txt
```
The script generates two output files:

- `events_gcal.json` – a format ready to send directly to the Google Calendar API (`summary`, `start`, `end`, `description`).
- `events_gt.json` – a format compatible with the team's reference dataset (`Data/GroundTruth/`).

### Process text provided directly:
```bash
python3 run.py --text "W piątek o 15:00 spotkanie z promotorem przez 45 minut, potem od 17 do 18:30 siłownia"
```

---

## Testing and Evaluation

### Run unit tests:
```bash
pytest tests/ -v
```

### Run the benchmark on the reference dataset (30 files):
```bash
python3 evaluate.py
```
You can limit the evaluation to the first 5 files:
```bash
python3 evaluate.py --limit 5
```
