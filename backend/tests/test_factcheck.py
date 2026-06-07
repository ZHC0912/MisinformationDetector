"""
Unit tests for factcheck.py — specifically combine_verdicts().
No API calls are made; all external calls go through fc_google / fc_gemini
which are not exercised here.
"""

import pytest
from factcheck import combine_verdicts


class TestCombineVerdicts:
    def test_both_misleading_returns_misleading(self):
        verdict, _ = combine_verdicts("Misleading", 0.9, "FALSE", 0.92)
        assert verdict == "Misleading"

    def test_both_misleading_explanation_mentions_both(self):
        _, explanation = combine_verdicts("Misleading", 0.9, "FALSE", 0.92)
        assert "Both" in explanation

    def test_fc_misleading_style_ok_returns_misleading(self):
        verdict, _ = combine_verdicts("Reliable", 0.8, "FALSE", 0.92)
        assert verdict == "Misleading"

    def test_fc_partially_true_style_ok_returns_misleading(self):
        verdict, _ = combine_verdicts("Reliable", 0.8, "PARTIALLY TRUE", 0.85)
        assert verdict == "Misleading"

    def test_style_misleading_fc_ok_returns_partially_reliable(self):
        verdict, _ = combine_verdicts("Misleading", 0.8, "TRUE", 0.92)
        assert verdict == "Partially Reliable"

    def test_both_reliable_returns_reliable(self):
        verdict, _ = combine_verdicts("Reliable", 0.85, "TRUE", 0.90)
        assert verdict == "Reliable"

    def test_unverifiable_returns_style_verdict(self):
        for style in ("Reliable", "Misleading"):
            verdict, _ = combine_verdicts(style, 0.7, "UNVERIFIABLE", 0.5)
            assert verdict == style

    def test_unverifiable_gemini_mentions_ai(self):
        _, explanation = combine_verdicts("Reliable", 0.8, "UNVERIFIABLE", 0.5, "gemini_llm")
        assert "AI" in explanation

    def test_unverifiable_not_found_mentions_verify(self):
        _, explanation = combine_verdicts("Reliable", 0.8, "UNVERIFIABLE", 0.5, "not_found")
        assert "verify" in explanation.lower() or "verified" in explanation.lower()

    def test_returns_tuple_of_two(self):
        result = combine_verdicts("Reliable", 0.8, "TRUE", 0.9)
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_explanation_is_nonempty_string(self):
        _, explanation = combine_verdicts("Misleading", 0.9, "FALSE", 0.92)
        assert isinstance(explanation, str)
        assert len(explanation) > 0
