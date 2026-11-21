"""Klient HTTP: notatka na wejściu, JSON na standardowym wyjściu."""

import argparse
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request

from backend.core.config import get_settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Wyślij notatkę do Note2Task i wypisz JSON.")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--text", "-t", help="Treść notatki")
    source.add_argument("--input", "-i", type=Path, help="Plik UTF-8 z notatką")
    parser.add_argument("--url", default=None, help="Adres API")
    parser.add_argument("--schedule", action="store_true", help="Analizuj i zapisz wydarzenia w Google Calendar")
    args = parser.parse_args(argv)

    try:
        settings = get_settings()
        api_url = args.url or settings.client_url
        if args.input is not None:
            text = args.input.read_text(encoding="utf-8-sig")
        elif args.text is not None:
            text = args.text
        elif sys.stdin.isatty():
            print("Podaj notatkę i naciśnij Enter: ", end="", file=sys.stderr, flush=True)
            text = input()
        else:
            text = sys.stdin.read()
        if not text.strip():
            raise ValueError("Notatka nie może być pusta.")

        endpoint = "schedule" if args.schedule else "extract"
        request = urllib.request.Request(
            f"{api_url.rstrip('/')}/{endpoint}",
            data=json.dumps({"text": text.strip()}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=200) as response:
            result = json.load(response)
        if args.schedule:
            if not isinstance(result, dict) or "results" not in result or result.get("status") not in {"completed", "partial", "failed"}:
                raise ValueError("API nie zwróciło raportu zapisu wydarzeń.")
        elif not isinstance(result, list):
            raise ValueError("API nie zwróciło listy wydarzeń.")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if not args.schedule or result["status"] == "completed" else 1
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"Błąd API HTTP {exc.code}: {body}", file=sys.stderr)
    except (OSError, ValueError, EOFError) as exc:
        print(f"Błąd: {exc}", file=sys.stderr)
    except KeyboardInterrupt:
        print("Przerwano.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
