"""
=============================================================
FACT-CHECK ORCHESTRATOR
File: backend/factcheck.py

Hybrid pipeline:
  1. fc_google.py  — Google Fact Check Tools API (human-reviewed)
  2. fc_gemini.py  — Gemini 2.5 Flash LLM (AI inference fallback)

Also owns combine_verdicts() which merges the fact-check
result with the NLP style analysis from textanalysis.py.
=============================================================
"""

from config    import GEMINI_FC_MODEL   # re-exported for main.py /model-info
from fc_google import fact_check_google


def fact_check(text: str) -> dict:
    """
    Query the Google Fact Check Tools API only.
    Returns a 'not_found' sentinel if no indexed human-reviewed record exists
    so the caller can offer the user an optional AI check.
    """
    print("  [Fact-Check] Querying Google Fact Check Tools API...")
    result = fact_check_google(text)

    if result:
        print(f"  [Fact-Check] Google match found: {result['verdict']}")
        return result

    print("  [Fact-Check] No indexed record found.")
    claim = text.replace("\n", " ").split(".")[0].strip()[:150]
    return {
        "verdict":           "UNVERIFIABLE",
        "confidence":        0.5,
        "summary":           "No human fact-check records were found for this content.",
        "explanation":       (
            "The Google Fact Check Tools API did not return any matching "
            "human-reviewed fact-checks for this claim. This does not mean "
            "the content is accurate or inaccurate — it has simply not been "
            "reviewed by fact-checkers indexed in the database."
        ),
        "sources":           [],
        "claim_extracted":   claim,
        "error":             None,
        "fact_check_source": "not_found",
    }


def combine_verdicts(style_verdict: str, style_conf: float,
                     fc_verdict:    str, fc_conf:    float,
                     fact_check_source: str = "") -> tuple:
    """
    Combine the NLP writing-style verdict with the fact-check verdict.
    Returns (final_verdict, final_explanation).
    """
    fc_misleading    = fc_verdict in ("FALSE", "PARTIALLY TRUE")
    style_misleading = style_verdict == "Misleading"

    if fc_verdict == "UNVERIFIABLE":
        if fact_check_source == "gemini_llm":
            return style_verdict, (
                f"The AI writing style analysis assessed this content as {style_verdict} "
                f"with {style_conf*100:.0f}% confidence. "
                f"An AI fact-check was also performed but could not verify the claim — "
                f"it may be too recent, niche, or ambiguous to assess. "
                f"We recommend checking against trusted fact-checking sources."
            )
        return style_verdict, (
            f"The AI writing style analysis assessed this content as {style_verdict} "
            f"with {style_conf*100:.0f}% confidence. "
            f"The factual claim could not be independently verified. "
            f"We recommend checking this content against trusted fact-checking sources."
        )

    if fc_misleading and style_misleading:
        return "Misleading", (
            f"Both analyses flag this content as problematic. "
            f"Writing style analysis detected misleading linguistic patterns "
            f"({style_conf*100:.0f}% confidence), and the fact-check found the "
            f"claim to be {fc_verdict} ({fc_conf*100:.0f}% confidence). "
            f"This content should not be trusted or shared without independent verification."
        )

    if fc_misleading and not style_misleading:
        return "Misleading", (
            f"Although the writing style appears credible, the fact-check found "
            f"the claim to be {fc_verdict} ({fc_conf*100:.0f}% confidence). "
            f"This suggests deliberately credible-sounding writing used to spread "
            f"false information — a pattern common in sophisticated misinformation."
        )

    if not fc_misleading and style_misleading:
        return "Partially Reliable", (
            f"The fact-check found the core claim to be {fc_verdict} "
            f"({fc_conf*100:.0f}% confidence), however the writing style analysis "
            f"detected potentially misleading linguistic patterns "
            f"({style_conf*100:.0f}% confidence). "
            f"The facts may be accurate but the framing may be misleading."
        )

    return "Reliable", (
        f"Both analyses indicate this content is credible. "
        f"The fact-check assessed the claim as {fc_verdict} "
        f"({fc_conf*100:.0f}% confidence), and the writing style analysis found "
        f"no significant misleading language patterns ({style_conf*100:.0f}% confidence). "
        f"However, always verify important information independently."
    )
