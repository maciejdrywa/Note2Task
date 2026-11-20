"""Konfiguracja modułu Note2Task."""

import os
from pathlib import Path

# Ścieżki katalogów
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "Data"
TXT_DIR = DATA_DIR / "TXT"
GROUND_TRUTH_DIR = DATA_DIR / "GroundTruth"

# Konfiguracja Ollama
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
MODEL_NAME = os.getenv("NOTE2TASK_MODEL", "qwen2.5:3b")
REQUEST_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))

# Konfiguracja terminów kalendarza
DEFAULT_DURATION_MINUTES = int(os.getenv("DEFAULT_DURATION_MINUTES", "60"))
DEFAULT_TIMEZONE = os.getenv("DEFAULT_TIMEZONE", "Europe/Warsaw")
