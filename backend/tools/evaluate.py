#!/usr/bin/env python3
"""Narzędzie ewaluacji modelu Note2Task na zbiorze Data/GroundTruth."""

import sys
from pathlib import Path

import argparse
import json
from typing import Dict, List, Tuple

from backend.core.config import GROUND_TRUTH_DIR, TXT_DIR, get_settings
from backend.clients.ollama import OllamaClient
from backend.services.extraction_service import ExtractionService
from backend.services.date_service import convert_to_ground_truth_format


def normalize_activity_str(text: str) -> set:
    """Upraszcza i tokenizuje ciąg czynności do porównania słów kluczowych."""
    import re
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    words = set(cleaned.split())
    stopwords = {"po", "w", "z", "ze", "o", "do", "na", "i", "a", "dla", "się", "od"}
    return words - stopwords


def match_items(pred_items: List[dict], gt_items: List[dict]) -> Tuple[int, int, List[dict]]:
    """
    Porównuje wygenerowane zadania z wzorcowymi ze zbioru GroundTruth.
    W pierwszej kolejności łączy zadania na podstawie dopasowania czynności (overlap słów kluczowych),
    a dopiero potem weryfikuje poprawność godziny (godzina null nie zalicza zgodności czasu).
    """
    exact_time_matches = 0
    activity_matches = 0
    matched_gt = set()

    for p in pred_items:
        p_act_words = normalize_activity_str(p.get("czynność", ""))
        p_time = p.get("godzina")

        best_match_idx = None
        best_score = 0
        best_overlap = 0

        # Krok 1: Wyszukanie w GT zadania o największym podobieństwie czynności (z preferencją zgodności czasu przy remisie)
        for j, gt in enumerate(gt_items):
            if j in matched_gt:
                continue
            gt_act_words = normalize_activity_str(gt.get("czynność", ""))
            overlap = len(p_act_words & gt_act_words)
            if overlap > 0:
                is_time_match = (p_time == gt.get("godzina") and p_time is not None)
                score = overlap * 10 + (5 if is_time_match else 0)
                if score > best_score:
                    best_score = score
                    best_match_idx = j
                    best_overlap = overlap

        # Krok 2: Jeśli dopasowano czynność, sprawdź poprawność godziny
        if best_match_idx is not None and best_overlap > 0:
            activity_matches += 1
            matched_gt.add(best_match_idx)
            gt_time = gt_items[best_match_idx].get("godzina")

            # Poprawne dopasowanie czasu: obie godziny istnieją i są identyczne
            if p_time and gt_time and p_time == gt_time:
                exact_time_matches += 1

    return exact_time_matches, activity_matches, pred_items


def evaluate(limit: int = None, model_name: str | None = None):
    txt_files = sorted(TXT_DIR.glob("*.txt"), key=lambda p: int(p.stem) if p.stem.isdigit() else 999)
    eval_files = [f for f in txt_files if f.stem.isdigit()]

    if limit:
        eval_files = eval_files[:limit]

    if not eval_files:
        print("[!] Brak plików testowych w Data/TXT/.", file=sys.stderr)
        return

    settings = get_settings()
    model_name = model_name or settings.model_name
    print("=" * 70)
    print(f"      Ewaluacja Note2Task na zbiorze referencyjnym ({len(eval_files)} plików)")
    print(f"      Model: {model_name}")
    print("=" * 70)

    extractor = ExtractionService(OllamaClient(str(settings.ollama_host), model_name, settings.ollama_timeout))

    total_gt_items = 0
    total_pred_items = 0
    total_time_matches = 0
    total_act_matches = 0

    results_table = []

    for f in eval_files:
        gt_path = GROUND_TRUTH_DIR / f.with_suffix(".json").name
        if not gt_path.exists():
            continue

        raw_text = f.read_text(encoding="utf-8-sig").strip()
        gt_data = json.loads(gt_path.read_text(encoding="utf-8"))

        # Ekstrakcja
        pred_gt = convert_to_ground_truth_format(extractor.extract_from_text(raw_text))

        file_gt_count = sum(len(items) for items in gt_data.values())
        file_pred_count = sum(len(items) for items in pred_gt.values())

        all_pred = [it for items in pred_gt.values() for it in items]
        all_gt = [it for items in gt_data.values() for it in items]

        t_match, a_match, _ = match_items(all_pred, all_gt)

        total_gt_items += file_gt_count
        total_pred_items += file_pred_count
        total_time_matches += t_match
        total_act_matches += a_match

        file_time_acc = (t_match / file_gt_count * 100) if file_gt_count else 0
        results_table.append({
            "plik": f.name,
            "gt_count": file_gt_count,
            "pred_count": file_pred_count,
            "time_matches": t_match,
            "acc": f"{file_time_acc:.0f}%"
        })

        print(f"[*] {f.name:6s} -> GT: {file_gt_count} zadań, Wykryto: {file_pred_count}, Dopasowane zadania: {a_match}/{file_gt_count}, Poprawne godziny: {t_match}/{file_gt_count} ({file_time_acc:.0f}%)")

    time_precision = (total_time_matches / total_pred_items * 100) if total_pred_items else 0
    time_recall = (total_time_matches / total_gt_items * 100) if total_gt_items else 0
    act_recall = (total_act_matches / total_gt_items * 100) if total_gt_items else 0

    print("\n" + "=" * 70)
    print("               PODSUMOWANIE WYNIKÓW EWALUACJI")
    print("=" * 70)
    print(f"Liczba sprawdzonych plików:           {len(eval_files)}")
    print(f"Łączna liczba wzorcowych zadań (GT): {total_gt_items}")
    print(f"Łączna liczba wykrytych zadań:        {total_pred_items}")
    print(f"Rozpoznane czynności (Task Match):    {total_act_matches} ({act_recall:.1f}%)")
    print(f"Poprawnie dopasowane godziny:         {total_time_matches}")
    print(f"Time Recall (Czułość godzinowa):      {time_recall:.1f}%")
    print(f"Time Precision (Precyzja godzinowa):  {time_precision:.1f}%")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="Ewaluacja Note2Task na Data/GroundTruth.")
    parser.add_argument("--limit", "-l", type=int, default=None, help="Maksymalna liczba plików do ewaluacji (domyślnie wszystkie)")
    parser.add_argument("--model", "-m", type=str, default=None, help="Nazwa modelu")
    args = parser.parse_args()

    evaluate(limit=args.limit, model_name=args.model)


if __name__ == "__main__":
    main()
