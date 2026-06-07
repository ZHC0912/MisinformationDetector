"""
Unit tests for textanalysis.py
Runs in heuristic mode (no model weights needed).
"""

import pytest
from textanalysis import (
    _heuristic_predict,
    _split_into_chunks,
    extract_features,
    generate_explanation,
    analyse,
    is_model_loaded,
    _CHUNK_WORD_LIMIT,
)

MISLEADING_TEXT = (
    "shocking leaked bombshell secret exposed government hiding real truth "
    "wake up they don't want you to know cover-up hoax conspiracy"
)
CREDIBLE_TEXT = (
    "According to a study published by researchers, the data confirms "
    "75 percent of findings cited by officials. The analysis was peer-reviewed "
    "and the spokesperson confirmed the statistics in an official statement."
)


class TestHeuristicPredict:
    def test_misleading_text_scores_high(self):
        result = _heuristic_predict(MISLEADING_TEXT)
        assert result["misleading_prob"] > 0.5
        assert result["mode"] == "heuristic"

    def test_probabilities_sum_to_one(self):
        for text in [MISLEADING_TEXT, CREDIBLE_TEXT, "neutral plain text here"]:
            result = _heuristic_predict(text)
            total = result["misleading_prob"] + result["reliable_prob"]
            assert abs(total - 1.0) < 1e-6

    def test_deterministic_for_same_input(self):
        r1 = _heuristic_predict(CREDIBLE_TEXT)
        r2 = _heuristic_predict(CREDIBLE_TEXT)
        assert r1["misleading_prob"] == r2["misleading_prob"]

    def test_required_keys_present(self):
        result = _heuristic_predict("some text")
        assert {"misleading_prob", "reliable_prob", "mode", "chunks"} == set(result.keys())

    def test_chunks_always_empty(self):
        assert _heuristic_predict(CREDIBLE_TEXT)["chunks"] == []


class TestSplitIntoChunks:
    def test_short_text_stays_one_chunk(self):
        text = "This is a short sentence."
        chunks = _split_into_chunks(text)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_long_text_splits_correctly(self):
        sentence = "This sentence has exactly ten words in it here. "
        text = sentence * 22  # ~220 words
        chunks = _split_into_chunks(text)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk.split()) <= _CHUNK_WORD_LIMIT

    def test_no_words_lost(self):
        sentence = "Word " * 15 + "end. "
        text = (sentence * 15).strip()
        chunks = _split_into_chunks(text)
        original_words = len(text.split())
        chunk_words = sum(len(c.split()) for c in chunks)
        assert chunk_words == original_words

    def test_empty_string(self):
        chunks = _split_into_chunks("")
        assert chunks == [] or chunks == [""]


class TestExtractFeatures:
    def test_detects_warning_words(self):
        features = extract_features(MISLEADING_TEXT, 0.9)
        types = [f["type"] for f in features]
        assert "warning" in types

    def test_detects_credible_words(self):
        features = extract_features(CREDIBLE_TEXT, 0.1)
        types = [f["type"] for f in features]
        assert "credible" in types

    def test_max_eight_features(self):
        features = extract_features(MISLEADING_TEXT + " " + CREDIBLE_TEXT, 0.5)
        assert len(features) <= 8

    def test_sorted_by_score_descending(self):
        features = extract_features(MISLEADING_TEXT, 0.8)
        scores = [f["score"] for f in features]
        assert scores == sorted(scores, reverse=True)

    def test_feature_schema(self):
        features = extract_features(MISLEADING_TEXT, 0.7)
        for f in features:
            assert {"word", "score", "type"} == set(f.keys())
            assert f["type"] in ("warning", "credible")


class TestGenerateExplanation:
    def test_contains_verdict(self):
        features = extract_features(MISLEADING_TEXT, 0.85)
        exp = generate_explanation("Misleading", 0.85, 15, features)
        assert "Misleading" in exp

    def test_contains_confidence_percentage(self):
        features = []
        exp = generate_explanation("Reliable", 0.75, 75, features)
        assert "75.0%" in exp

    def test_no_patterns_fallback(self):
        exp = generate_explanation("Reliable", 0.6, 60, [])
        assert "No strong" in exp

    def test_returns_string(self):
        assert isinstance(generate_explanation("Misleading", 0.9, 10, []), str)


class TestAnalyse:
    def test_returns_required_keys(self):
        result = analyse("This is a sample article text for testing purposes with enough words.")
        required = {
            "style_verdict", "confidence", "credibility_score",
            "misleading_prob", "reliable_prob", "key_features",
            "style_explanation", "mode", "chunks",
        }
        assert required.issubset(result.keys())

    def test_probabilities_sum_to_one(self):
        result = analyse(CREDIBLE_TEXT)
        total = result["misleading_prob"] + result["reliable_prob"]
        assert abs(total - 1.0) < 1e-4

    def test_verdict_consistent_with_prob(self):
        result = analyse(MISLEADING_TEXT)
        if result["misleading_prob"] >= 0.5:
            assert result["style_verdict"] == "Misleading"
        else:
            assert result["style_verdict"] == "Reliable"

    def test_credibility_score_range(self):
        result = analyse(CREDIBLE_TEXT)
        assert 0 <= result["credibility_score"] <= 100

    def test_heuristic_mode_when_no_model(self):
        assert not is_model_loaded()
        result = analyse("Some text.")
        assert result["mode"] == "heuristic"
