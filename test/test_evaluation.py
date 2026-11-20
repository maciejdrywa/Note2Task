import json
import unittest
from pathlib import Path
from unittest.mock import patch

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt

from src.evaluation.metrics.metrics import (
    activity_time_score,
    sentence_count_score,
    time_score,
)
from src.evaluation.visualisation.plot import (
    plot_activity_time_score,
    plot_model_comparison,
    plot_sentence_count_score,
    plot_time_score,
)


TEST_DIR = Path(__file__).resolve().parent


def calculate_scores(predictions, ground_truth):
    return (
        sentence_count_score(len(predictions), len(ground_truth)),
        time_score(predictions, ground_truth),
        activity_time_score(predictions, ground_truth),
    )


class EvaluationTest(unittest.TestCase):
    def test_scores_and_charts(self):
        source = TEST_DIR.parent / "Data" / "GroundTruth" / "6.json"
        ground_truth = json.loads(source.read_text(encoding="utf-8"))
        swapped_times = {
            "zdanie1": [
                {"czynność": "pójść do biblioteki", "godzina": "18.25"},
                {"czynność": "zadzwonić do babci", "godzina": "14,25"},
            ]
        }

        correct_scores = calculate_scores(ground_truth, ground_truth)
        swapped_scores = calculate_scores(swapped_times, ground_truth)
        self.assertEqual(correct_scores, (100, 100, 100))
        self.assertEqual(swapped_scores[0], 50)
        self.assertAlmostEqual(swapped_scores[1], 200 / 3)
        self.assertEqual(swapped_scores[2], 0)

        output_dir = TEST_DIR / "charts"
        output_dir.mkdir(exist_ok=True)
        self.addCleanup(plt.close, "all")
        model_scores = {"Model 1": correct_scores, "Model 2": swapped_scores}
        plots = (
            (plot_sentence_count_score, swapped_scores[0], "sentence_count"),
            (plot_time_score, swapped_scores[1], "time"),
            (plot_activity_time_score, swapped_scores[2], "activity_time"),
        )

        with patch.object(plt, "show"):
            for plot, score, name in plots:
                with self.subTest(chart=name):
                    figure = plot(score)
                    axes = figure.axes[0]
                    self.assertEqual([bar.get_height() for bar in axes.patches], [score])
                    self.assertEqual([label.get_text() for label in axes.texts], [f"{score:.1f}%"])
                    figure.savefig(output_dir / f"{name}.png", dpi=140)

            figure = plot_model_comparison(model_scores)
            axes = figure.axes[0]
            self.assertEqual([label.get_text() for label in axes.get_xticklabels()], list(model_scores))
            expected_bars = [score for pair in zip(correct_scores, swapped_scores) for score in pair]
            self.assertEqual([bar.get_height() for bar in axes.patches], expected_bars)
            figure.savefig(output_dir / "model_comparison.png", dpi=140)
