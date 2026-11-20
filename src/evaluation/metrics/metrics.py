from collections import Counter


def _percentage(matches, total):
    if total == 0:
        return 100.0
    return 100.0 * matches / total


def _tasks(sentences):
    for tasks in sentences.values():
        yield from tasks


def _normalize_time(time):
    if time is None:
        return None
    return time.strip().replace(".", ":").replace(",", ":").zfill(5)


def _match_score(predicted, expected):
    matches = sum((predicted & expected).values())
    total = max(sum(predicted.values()), sum(expected.values()))
    return _percentage(matches, total)


def sentence_count_score(predicted_count, expected_count): #sprawdza czy model przewidział dobrą ilosc zdan/czynnosci
    if predicted_count < 0 or expected_count < 0:
        raise ValueError("Sentence counts cannot be negative.")

    return _percentage(
        min(predicted_count, expected_count),
        max(predicted_count, expected_count),
    )


def time_score(predictions, ground_truth): #sprawdza czy model dobrze przewidział czas czynności
    predicted = Counter(
        _normalize_time(task["godzina"])
        for task in _tasks(predictions)
        if task["godzina"] is not None
    )
    expected = Counter(
        _normalize_time(task["godzina"])
        for task in _tasks(ground_truth)
        if task["godzina"] is not None
    )
    return _match_score(predicted, expected)


def activity_time_score(predictions, ground_truth): #sprawdza czy model dobrze przewidział dobrze czynność i czas
    predicted = Counter(
        (" ".join(task["czynność"].casefold().split()), _normalize_time(task["godzina"]))
        for task in _tasks(predictions)
    )
    expected = Counter(
        (" ".join(task["czynność"].casefold().split()), _normalize_time(task["godzina"]))
        for task in _tasks(ground_truth)
    )
    return _match_score(predicted, expected)
