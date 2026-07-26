"""
=============================================================
FACT-CHECK FEED  (public "Recently fact-checked" panel)
File: backend/factcheck_feed.py

Backs the GET /api/fact-checks endpoint. This is SEPARATE from the per-analysis
fact-check in fc_google.py / factcheck.py:
  - factcheck.py     → verifies ONE claim during an /analyse request
  - factcheck_feed.py → lists RECENT fact-checks for a browse-able topic feed

It queries the same Google Fact Check Tools API (claims:search) with the
server-side key, normalises each ClaimReview into a flat card shape, and caches
results per query so repeated browsing does not burn API quota.

Scope: the feed focuses on ATTRIBUTED CLAIMS — fact-checked statements that have
a named speaker (`claimant`) — so it covers claims by public figures, the
"influential sources" half of the project that isn't the outlet reliability
index. Cards with no claimant are dropped. Speakers are surfaced by FILTERING,
never hand-picked, to avoid selection bias.

IMPORTANT (viva-defensible): every item returned is a REAL published fact-check
from Google's ClaimReview corpus (PolitiFact, Snopes, AFP, FactCheck.org, ...).
Nothing here is mock data. The API has no popularity/"trending" signal, so the
feed is ordered by review recency and labelled "Recently fact-checked".
=============================================================
"""

import logging
import threading
import time

import requests

from config import GFCT_API_KEY, GFCT_URL
from fc_google import _normalise_rating   # reuse the same rating→verdict mapping

log = logging.getLogger(__name__)

# ── Cache ───────────────────────────────────────────────────────
# In-memory TTL cache, keyed by (query|lang|max_age_days). Respects API quota:
# the same topic browsed repeatedly hits Google at most once per TTL window.
_CACHE_TTL_SECONDS = 2 * 60 * 60      # 2 hours — fewer cold-miss calls to Google
_cache: dict[str, tuple[float, list]] = {}
_cache_lock = threading.Lock()

# Default topics used when no search query is supplied, so the feed has content
# on first load. The navbar search refines this to a single user topic.
# Two neutral, high-yield topics only (one Google call each on a cold miss) —
# kept small deliberately to limit API usage; the attributed-claimant filter
# below then narrows these to claims made by a named speaker.
DEFAULT_QUERIES = ["health", "election"]

_MAX_ITEMS = 24                        # cap cards returned to the frontend


def _cache_get(key: str) -> list | None:
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        ts, data = entry
        if time.time() - ts > _CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        return data


def _cache_put(key: str, data: list) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), data)


# ── Google claims:search ────────────────────────────────────────
def _search_google(query: str, lang: str, max_age_days: int) -> list:
    """One raw claims:search call → list of normalised card dicts (never raises)."""
    params = {"query": query, "languageCode": lang, "pageSize": 20}
    if max_age_days and max_age_days > 0:
        params["maxAgeDays"] = max_age_days
    try:
        resp = requests.get(
            GFCT_URL,
            params=params,
            headers={"x-goog-api-key": GFCT_API_KEY},   # key stays server-side
            timeout=10,
        )
        if resp.status_code != 200:
            log.warning("[feed] claims:search error %s for query=%r", resp.status_code, query)
            return []
        claims = resp.json().get("claims", [])
    except Exception as e:
        log.error("[feed] claims:search request failed for query=%r: %s", query, e)
        return []

    cards = []
    for claim in claims:
        claim_text = (claim.get("text") or "").strip()
        claimant   = (claim.get("claimant") or "").strip()
        for review in claim.get("claimReview", []):
            rating = (review.get("textualRating") or "").strip()
            url    = review.get("url") or ""
            if not rating or not url:
                continue
            cards.append({
                "claim":       claim_text,
                "claimant":    claimant,
                "publisher":   (review.get("publisher") or {}).get("name", "").strip(),
                "verdict":     rating,                       # raw publisher rating (for the chip label)
                "ratingClass": _normalise_rating(rating),    # TRUE / FALSE / PARTIALLY TRUE / UNVERIFIABLE (for colour)
                "reviewDate":  review.get("reviewDate") or "",
                "url":         url,
            })
    return cards


def _dedupe(cards: list) -> list:
    """Drop duplicate reviews (same url), keeping first seen."""
    seen, out = set(), []
    for c in cards:
        if c["url"] in seen:
            continue
        seen.add(c["url"])
        out.append(c)
    return out


def get_fact_checks(query: str = "", lang: str = "en", max_age_days: int = 30) -> list:
    """
    Return a list of recent, real fact-check cards for `query` (or a default
    blend of topics when `query` is blank). Cached per query for _CACHE_TTL.

    Card shape: { claim, claimant, publisher, verdict, ratingClass, reviewDate, url }
    Ordered by reviewDate, newest first (the API exposes no popularity ranking).
    """
    query = (query or "").strip()
    lang  = (lang or "en").strip() or "en"
    key   = f"{query.lower()}|{lang}|{max_age_days}"

    cached = _cache_get(key)
    if cached is not None:
        log.info("[feed] cache hit key=%r (%d items)", key, len(cached))
        return cached

    if query:
        cards = _search_google(query, lang, max_age_days)
    else:
        # Blend a few default topics so the panel is populated on first load.
        cards = []
        for q in DEFAULT_QUERIES:
            cards.extend(_search_google(q, lang, max_age_days))

    # Influential-figures focus: keep only claims with a named speaker. An
    # attributed claimant is what makes the feed "claims by public figures"
    # WITHOUT hand-picking names (which would introduce selection bias).
    cards = [c for c in cards if c["claimant"].strip()]

    cards = _dedupe(cards)
    # Newest review first — the only ordering the API data honestly supports.
    cards.sort(key=lambda c: c["reviewDate"], reverse=True)
    cards = cards[:_MAX_ITEMS]

    _cache_put(key, cards)
    log.info("[feed] cache miss key=%r → %d items fetched", key, len(cards))
    return cards
