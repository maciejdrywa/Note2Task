import matplotlib.pyplot as plt


METRIC_LABELS = ("Sentence count", "Time", "Activity and time")


def _show_chart(figure, axes, title):
    axes.set_title(title)
    axes.set_ylabel("Score (%)")
    axes.set_ylim(0, 110)
    axes.set_yticks(range(0, 101, 20))
    for bars in axes.containers:
        axes.bar_label(bars, fmt="%.1f%%", padding=3)
    figure.tight_layout()
    plt.show()
    return figure


def _plot_score(score, label):
    figure, axes = plt.subplots(figsize=(5, 4))
    axes.bar([label], [score], width=0.45)
    return _show_chart(figure, axes, label)


def plot_sentence_count_score(score):
    return _plot_score(score, METRIC_LABELS[0])


def plot_time_score(score):
    return _plot_score(score, METRIC_LABELS[1])


def plot_activity_time_score(score):
    return _plot_score(score, METRIC_LABELS[2])


def plot_model_comparison(model_scores):
    if not model_scores:
        raise ValueError("Provide scores for at least one model.")

    model_names = list(model_scores)
    sentence_scores, time_scores, activity_scores = zip(*model_scores.values())
    positions = range(len(model_names))
    bar_width = 0.25

    figure, axes = plt.subplots(figsize=(max(7, len(model_names) * 2), 4.5))
    for offset, label, scores in zip(
        (-bar_width, 0, bar_width),
        METRIC_LABELS,
        (sentence_scores, time_scores, activity_scores),
    ):
        axes.bar(
            [position + offset for position in positions],
            scores,
            width=bar_width,
            label=label,
        )

    axes.set_xticks(positions, model_names)
    axes.legend(loc="lower center", bbox_to_anchor=(0.5, 1.08), ncol=3)
    return _show_chart(figure, axes, "Model comparison")
