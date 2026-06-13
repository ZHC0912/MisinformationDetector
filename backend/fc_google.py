"""
=============================================================
GOOGLE FACT CHECK TOOLS API
File: backend/fc_google.py

Queries the Google Fact Check Tools API — a database of
human-reviewed fact-checks from PolitiFact, Snopes, AFP,
Reuters Fact Check, FactCheck.org, and others.

Returns None if no indexed fact-check is found for the claim,
so the caller can decide whether to fall back to another source.
=============================================================
"""

import logging
import re

import requests
from config import GFCT_API_KEY, GFCT_URL

log = logging.getLogger(__name__)


# ── Claim extraction ────────────────────────────────────────────
def extract_claim(text: str, max_chars: int = 150) -> str:
    """
    Pick the most "claim-like" sentence from the text instead of blindly taking
    the first one. Scores each sentence by named-entity / statistic density using
    a lightweight, dependency-free heuristic:
      - capitalised words mid-sentence  → proper-noun (entity) proxy
      - tokens containing digits        → statistics/dates (strong claim signal)
    Earliest sentence wins on a tie. Falls back to the first sentence.

    (A spaCy NER model would be more accurate but adds a heavy dependency + model
    download; this heuristic captures most of the benefit for free.)
    """
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    if not text:
        return ""

    sentences = re.split(r"(?<=[.!?])\s+", text)
    best, best_score = None, -1
    for s in sentences:
        s = s.strip()
        if len(s) < 20:                      # too short to be a meaningful claim
            continue
        words = s.split()
        entity_hits = sum(1 for w in words[1:] if w[:1].isupper())      # skip first word
        digit_hits  = sum(1 for w in words if any(c.isdigit() for c in w))
        score = entity_hits + 2 * digit_hits
        if len(s) > max_chars:               # mild penalty for overly long sentences
            score -= 1
        if score > best_score:
            best, best_score = s, score

    if best is None:
        best = sentences[0].strip() if sentences else text
    return best[:max_chars]


# ── Rating normalisation ────────────────────────────────────────
# Partial keywords are checked first to prevent "mostly true/false"
# from being misclassified as a plain TRUE or FALSE.

_PARTIAL_KEYWORDS = [
    "mostly false", "mostly true", "largely true", "largely false",
    "half-true", "half true", "partly false", "partly true",
    "partially true", "partially false", "mixture", "misleading",
    "missing context", "needs context", "exaggerated", "pinocchio",
    "disputed",
]
_FALSE_KEYWORDS = [
    "false", "fake", "incorrect", "untrue", "debunked", "no evidence",
    "fabricated", "wrong", "inaccurate", "pants on fire",
]
_TRUE_KEYWORDS = [
    "true", "correct", "accurate", "verified", "confirmed",
]


def _normalise_rating(rating: str) -> str:
    """Map any publisher's textual rating to a standard verdict."""
    r = rating.lower().strip()
    if any(k in r for k in _PARTIAL_KEYWORDS):
        return "PARTIALLY TRUE"
    if any(k in r for k in _FALSE_KEYWORDS):
        return "FALSE"
    if any(k in r for k in _TRUE_KEYWORDS):
        return "TRUE"
    return "UNVERIFIABLE"


def _extract_query(text: str, max_chars: int = 150) -> str:
    """
    Build the API search query from the most claim-like sentence.
    The Google Fact Check API matches best against short, focused phrases
    (under 150 chars) rather than full article paragraphs.
    """
    return extract_claim(text, max_chars)


# ── Main function ───────────────────────────────────────────────

def fact_check_google(text: str) -> dict | None:
    """
    Search the Google Fact Check Tools API for an indexed fact-check
    matching the given text.

    Returns a result dict on success, or None if no match is found
    (so the caller can fall back to another method).
    """
    query = _extract_query(text)
    try:
        response = requests.get(
            GFCT_URL,
            params={"query": query, "key": GFCT_API_KEY, "languageCode": "en"},
            timeout=10,
        )

        if response.status_code != 200:
            log.warning("[Google FC] API error %s", response.status_code)
            return None

        claims = response.json().get("claims", [])
        if not claims:
            return None

        # Collect all reviews across the top 3 matched claims
        reviews = []
        for claim in claims[:3]:
            for review in claim.get("claimReview", []):
                rating = review.get("textualRating", "")
                if not rating:
                    continue
                reviews.append({
                    "claim_text": claim.get("text", ""),
                    "publisher":  review.get("publisher", {}).get("name", ""),
                    "url":        review.get("url", ""),
                    "rating":     rating,
                    "normalised": _normalise_rating(rating),
                })

        if not reviews:
            return None

        # Overall verdict: most severe rating wins (FALSE > PARTIALLY TRUE > TRUE)
        verdicts = [r["normalised"] for r in reviews]
        if "FALSE" in verdicts:
            overall = "FALSE"
        elif "PARTIALLY TRUE" in verdicts:
            overall = "PARTIALLY TRUE"
        elif "TRUE" in verdicts:
            overall = "TRUE"
        else:
            overall = "UNVERIFIABLE"

        top        = reviews[0]
        publishers = ", ".join(dict.fromkeys(r["publisher"] for r in reviews if r["publisher"]))
        sources    = list(dict.fromkeys(
            f"{r['publisher']} — {r['url']}" for r in reviews if r["url"]
        ))[:5]

        # ── Dynamic confidence ──────────────────────────────────
        # Derived from (a) how many reviewers agree with the overall verdict
        # (consensus) and (b) how many reviews exist (corroboration), rather
        # than a flat 0.92 for every match. Bounded to [0.55, 0.95].
        agree         = sum(1 for v in verdicts if v == overall)
        consensus     = agree / len(verdicts)
        review_factor = min(len(reviews), 5) / 5
        confidence    = round(min(0.95, max(0.55, 0.50 + 0.35 * consensus + 0.10 * review_factor)), 2)

        return {
            "verdict":           overall,
            "confidence":        confidence,
            "summary":           f"Fact-checked by {publishers}. Rated: \"{top['rating']}\".",
            "explanation":       (
                f"{len(reviews)} human fact-checker review(s) found for this claim, "
                f"{agree} of which agree on a \"{overall}\" verdict "
                f"({consensus*100:.0f}% consensus). "
                f"{top['publisher']} rated it as \"{top['rating']}\". "
                f"These verdicts are from independent, professional fact-checking "
                f"organisations and reflect actual investigation of the claim."
            ),
            "sources":           sources,
            "claim_extracted":   top["claim_text"] or text[:120],
            "error":             None,
            "fact_check_source": "google_fact_check_api",
        }

    except Exception as e:
        log.error("[Google FC] Exception: %s", e)
        return None
