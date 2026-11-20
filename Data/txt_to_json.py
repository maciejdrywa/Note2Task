import json
import re
from pathlib import Path


# A period between digits or after "godz." belongs to the time notation.
SENTENCE_END = re.compile(
    r"(?<!\bgodz)(?:(?<!\d)\.|\.(?!\d))+",
    re.IGNORECASE,
)


def main():
    data_dir = Path(__file__).resolve().parent / "Data"
    output_dir = data_dir / "JSON"
    output_dir.mkdir(parents=True, exist_ok=True)

    for source in sorted((data_dir / "TXT").glob("*.txt")):
        text = source.read_text(encoding="utf-8-sig").strip()
        if not text:
            continue

        sentences = (part.strip() for part in SENTENCE_END.split(text))
        result = {
            f"zdanie{number}": sentence
            for number, sentence in enumerate(filter(None, sentences), start=1)
        }
        output = output_dir / source.with_suffix(".json").name
        output.write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
