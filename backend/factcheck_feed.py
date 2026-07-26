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

# The feed is split into two regions. Each region is a small set of
# (query, languageCode) pairs — one Google call per pair on a cold miss.
# Google has NO country filter, so region is approximated by keyword/language:
#   - malaysia: "Malaysia" in English + Malay (surfaces the local publisher
#     "Semakan Fakta"); Malaysian coverage is sparse in the last 30 days, so this
#     region uses NO age limit and takes the 8 most recent by review date.
#   - foreign : neutral global topics, with Malaysia-matching cards excluded so
#     the two regions never duplicate each other.
REGION_QUERIES: dict[str, list[tuple[str, str]]] = {
    "malaysia": [("Malaysia", "en"), ("Malaysia", "ms")],
    "foreign":  [("health", "en"), ("election", "en")],
}
# Per-region recency window (0 = no maxAgeDays filter; sort still puts newest first).
REGION_MAX_AGE: dict[str, int] = {"malaysia": 0, "foreign": 30}

_DEFAULT_REGION = "malaysia"
_SEARCH_MAX_AGE = 30                    # age window for an explicit navbar-search query
_MAX_ITEMS = 8                         # hard cap on cards per section


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


def _is_malaysia(card: dict) -> bool:
    """Heuristic: does this card relate to Malaysia? Used to keep the two regions
    disjoint (excluded from the 'foreign' section)."""
    blob = f"{card['claim']} {card['claimant']} {card['publisher']}".lower()
    return "malaysia" in blob or "malaysian" in blob


def _finalise(cards: list) -> list:
    """Shared post-processing: attributed-claimant filter, dedupe, newest-first, cap.

    Keep only claims with a named speaker (claimant) — this is what makes the feed
    'attributed claims by public figures' WITHOUT hand-picking names (which would
    introduce selection bias)."""
    cards = [c for c in cards if c["claimant"].strip()]
    cards = _dedupe(cards)
    cards.sort(key=lambda c: c["reviewDate"], reverse=True)   # only honest ordering
    return cards[:_MAX_ITEMS]


def get_fact_checks(query: str = "", region: str = _DEFAULT_REGION, lang: str = "en") -> list:
    """
    Return up to _MAX_ITEMS real, attributed fact-check cards.

    - If `query` is given: an explicit navbar search across the corpus (region
      ignored) at the recent-search window.
    - Otherwise: the `region` section ('malaysia' | 'foreign'), each a small blend
      of (query, language) pairs. 'foreign' excludes Malaysia-matching cards so the
      two sections don't overlap.

    Cached per (query | region) for _CACHE_TTL. Only the requested section is
    fetched — the frontend lazy-loads regions, so both are never fetched at once.

    Card shape: { claim, claimant, publisher, verdict, ratingClass, reviewDate, url }
    """
    query = (query or "").strip()
    lang  = (lang or "en").strip() or "en"

    if query:
        key = f"q:{query.lower()}|{lang}"
        cached = _cache_get(key)
        if cached is not None:
            log.info("[feed] cache hit %s (%d items)", key, len(cached))
            return cached
        cards = _finalise(_search_google(query, lang, _SEARCH_MAX_AGE))
        _cache_put(key, cards)
        log.info("[feed] cache miss %s → %d items", key, len(cards))
        return cards

    region = region if region in REGION_QUERIES else _DEFAULT_REGION
    key = f"r:{region}"
    cached = _cache_get(key)
    if cached is not None:
        log.info("[feed] cache hit %s (%d items)", key, len(cached))
        return cached

    age = REGION_MAX_AGE.get(region, 0)
    cards: list = []
    for q, qlang in REGION_QUERIES[region]:      # one Google call per (query, lang) pair
        cards.extend(_search_google(q, qlang, age))

    if region == "foreign":
        cards = [c for c in cards if not _is_malaysia(c)]

    cards = _finalise(cards)
    _cache_put(key, cards)
    log.info("[feed] cache miss %s → %d items", key, len(cards))
    return cards
