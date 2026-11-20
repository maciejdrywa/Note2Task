#!/usr/bin/env python3
"""Główny punkt wejścia CLI dla Note2Task."""

import os
import sys
from pathlib import Path

# Automatyczne przełączenie na środowisko .venv, jeśli uruchomiono zwykłym python3
venv_python = Path(__file__).resolve().parent / ".venv" / "bin" / "python3"
if venv_python.exists() and sys.executable != str(venv_python):
    try:
        import pydantic
    except ImportError:
        os.execv(str(venv_python), [str(venv_python)] + sys.argv)

import argparse
import json

from src.config import MODEL_NAME
from src.pipeline import Note2TaskPipeline


def print_banner():
    print("=" * 65)
    print("      Note2Task - Inteligentny Kalendarz (Model NLP)      ")
    print("=" * 65)


def print_events_summary(calendar_events):
    print("\n[+] Rozpoznane wydarzenia w kalendarzu:")
    print("-" * 65)
    if not calendar_events:
        print("  Brak wykrytych aktywności w podanym tekście.")
    for i, ev in enumerate(calendar_events, start=1):
        desc = f" ({ev.description})" if ev.description else ""
        print(f"  {i}. {ev.summary}{desc}")
        print(f"     Start:  {ev.start.dateTime}")
        print(f"     Koniec: {ev.end.dateTime}")
        print("-" * 65)


def main():
    parser = argparse.ArgumentParser(description="Ekstrakcja aktywności i godzin z notatek do Google Calendar.")
    parser.add_argument("--input", "-i", type=str, help="Ścieżka do pliku .txt z notatką")
    parser.add_argument("--text", "-t", type=str, help="Tekst notatki podany bezpośrednio w argumencie")
    parser.add_argument("--calendar-output", "-c", type=str, default="events_gcal.json", help="Plik wyjściowy Google Calendar JSON (domyślnie: events_gcal.json)")
    parser.add_argument("--gt-output", "-g", type=str, default="events_gt.json", help="Plik wyjściowy w formacie GroundTruth JSON (domyślnie: events_gt.json)")
    parser.add_argument("--model", "-m", type=str, default=MODEL_NAME, help=f"Nazwa modelu Ollama (domyślnie: {MODEL_NAME})")

    args = parser.parse_args()

    print_banner()

    note_text = ""
    input_path = None

    if args.input:
        input_path = Path(args.input)
        if not input_path.exists():
            print(f"[!] Błąd: Plik '{args.input}' nie istnieje.", file=sys.stderr)
            sys.exit(1)
        note_text = input_path.read_text(encoding="utf-8-sig").strip()
    elif args.text:
        note_text = args.text.strip()
    else:
        print("[?] Podaj treść notatki (lub wklej tekst i wciśnij Enter + Ctrl+D):")
        note_text = sys.stdin.read().strip()

    if not note_text:
        print("[!] Błąd: Pusta treść notatki.", file=sys.stderr)
        sys.exit(1)

    print(f"[*] Model: {args.model}")
    print(f"[*] Treść notatki:\n    \"{note_text}\"\n")
    print("[*] Analizowanie notatki przez lokalny model LLM...")

    pipeline = Note2TaskPipeline(model_name=args.model)
    cal_out = Path(args.calendar_output)
    gt_out = Path(args.gt_output)

    if input_path:
        events, gt = pipeline.process_file(input_path, cal_out, gt_out)
    else:
        events, gt, _ = pipeline.process_text(note_text)
        cal_out.write_text(json.dumps([e.model_dump() for e in events], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        gt_out.write_text(json.dumps(gt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print_events_summary(events)
    print(f"[✓] Zapisano format Google Calendar do: {cal_out.resolve()}")
    print(f"[✓] Zapisano format GroundTruth do:       {gt_out.resolve()}")


if __name__ == "__main__":
    main()
