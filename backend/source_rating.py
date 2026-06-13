"""
=============================================================
SOURCE RELIABILITY RATING + HISTORY  (MongoDB-backed)
File: backend/source_rating.py

Implements IR functional requirement FR5 (source reliability rating) and the
IR §2.4.4 MongoDB requirement together.

Two collections in MongoDB (db name from config.MONGODB_DB):
  source_ratings : { _id: domain, name, rating, bias, category }  — seeded lookup
  source_history : { domain, verdict, credibility_score, ts }     — per-assessment log

Graceful degradation: if config.MONGODB_URI is empty or the server is
unreachable, every function returns a safe default and the rest of the app
keeps working (rating shows as "unrated", history simply isn't recorded).
=============================================================
"""

import logging
import re
import time
from urllib.parse import urlparse

import config

log = logging.getLogger(__name__)

_client = None
_db     = None
_init_done = False

# Rating tiers (mirrors Media Bias/Fact Check factual-reporting levels)
RATING_TIERS = ["Very Low", "Low", "Mixed", "Mostly Factual", "High", "Very High"]


def _get_db():
    """Lazily connect to MongoDB. Returns the db handle or None if unavailable."""
    global _client, _db, _init_done
    if _init_done:
        return _db
    _init_done = True

    if not config.MONGODB_URI:
        log.info("[source_rating] MONGODB_URI not set — source rating/history disabled")
        return None

    try:
        from pymongo import MongoClient
        _client = MongoClient(config.MONGODB_URI, serverSelectionTimeoutMS=2000)
        _client.admin.command("ping")          # fail fast if unreachable
        _db = _client[config.MONGODB_DB]
        log.info("[source_rating] Connected to MongoDB db=%s", config.MONGODB_DB)
    except Exception as e:
        log.warning("[source_rating] MongoDB unavailable (%s) — rating/history disabled", e)
        _db = None
    return _db


def extract_domain(source: str) -> str:
    """
    Normalise a free-text source or URL into a lookup key.
      'https://www.bbc.com/news/...' -> 'bbc.com'
      'BBC News'                     -> 'bbc news'
    """
    if not source:
        return ""
    source = source.strip()
    if re.match(r"^https?://", source, re.IGNORECASE):
        host = urlparse(source).netloc.lower()
        return re.sub(r"^www\.", "", host)
    if "." in source and " " not in source:        # looks like a bare domain
        return re.sub(r"^www\.", "", source.lower())
    return source.lower()                            # treat as a plain name


def _score_to_tier(score: float) -> int:
    """Map an observed average credibility score (0-100) to a rating tier index."""
    if score >= 85: return 5   # Very High
    if score >= 70: return 4   # High
    if score >= 55: return 3   # Mostly Factual
    if score >= 40: return 2   # Mixed
    if score >= 25: return 1   # Low
    return 0                    # Very Low


def _lookup_seed(db, key: str):
    """Return the raw seeded rating doc for a domain (or name) key, or None."""
    doc = db.source_ratings.find_one({"_id": key})
    if doc is None:                                  # fall back to a name match
        doc = db.source_ratings.find_one(
            {"name": {"$regex": f"^{re.escape(key)}$", "$options": "i"}}
        )
    return doc


def get_rating(source: str) -> dict | None:
    """
    Reliability rating for a source, blending the seeded baseline with the
    source's observed track record in `source_history`:
      - "seed"         → cold start: too little history, use the seeded rating
      - "history"      → source not seeded, but enough assessments logged to rate it
      - "seed+history" → both available; weight on observed history grows with count

    Returns { domain, name, rating, bias, category, tier_index, basis,
              seed_rating, history } — or None only when the source is unknown
    AND has too little history (or the DB is unavailable).
    """
    db = _get_db()
    if db is None:
        return None

    key = extract_domain(source)
    if not key:
        return None

    try:
        seed     = _lookup_seed(db, key)
        hist     = get_history_summary(source)
        has_hist = hist is not None and hist["count"] >= config.SOURCE_MIN_HISTORY

        if seed is None and not has_hist:
            return None   # unknown source with too little data to rate

        seed_tier = (RATING_TIERS.index(seed["rating"])
                     if seed and seed.get("rating") in RATING_TIERS else None)
        obs_tier  = _score_to_tier(hist["avg_credibility"]) if has_hist else None

        if seed_tier is not None and obs_tier is not None:
            # blend: more history → lean more on observed track record
            w = min(hist["count"], config.SOURCE_HISTORY_WEIGHT_CAP) / config.SOURCE_HISTORY_WEIGHT_CAP
            eff_tier = round((1 - w) * seed_tier + w * obs_tier)
            basis    = "seed+history"
        elif seed_tier is not None:
            eff_tier, basis = seed_tier, "seed"
        else:
            eff_tier, basis = obs_tier, "history"

        eff_tier = max(0, min(len(RATING_TIERS) - 1, int(eff_tier)))

        return {
            "domain":      key,
            "name":        (seed.get("name", key) if seed else key),
            "rating":      RATING_TIERS[eff_tier],
            "bias":        (seed.get("bias", "Unknown") if seed else "Unknown"),
            "category":    (seed.get("category", "") if seed else ""),
            "tier_index":  eff_tier,
            "basis":       basis,
            "seed_rating": (seed.get("rating") if seed else None),
            "history":     hist,   # {count, avg_credibility, misleading_count} or None
        }
    except Exception as e:
        log.warning("[source_rating] lookup failed: %s", e)
        return None


def record_assessment(source: str, verdict: str, credibility_score: int) -> None:
    """Append one credibility assessment to source_history (best-effort, never raises)."""
    db = _get_db()
    if db is None:
        return
    key = extract_domain(source)
    if not key:
        return
    try:
        db.source_history.insert_one({
            "domain":            key,
            "verdict":           verdict,
            "credibility_score": credibility_score,
            "ts":                time.time(),
        })
    except Exception as e:
        log.warning("[source_rating] history insert failed: %s", e)


def get_history_summary(source: str) -> dict | None:
    """
    Aggregate past assessments for a source.
    Returns { count, avg_credibility, misleading_count } or None.
    """
    db = _get_db()
    if db is None:
        return None
    key = extract_domain(source)
    if not key:
        return None
    try:
        docs = list(db.source_history.find({"domain": key}))
        if not docs:
            return None
        n = len(docs)
        avg = sum(d.get("credibility_score", 0) for d in docs) / n
        mis = sum(1 for d in docs if d.get("verdict", "").lower().startswith("mislead"))
        return {
            "count":            n,
            "avg_credibility":  round(avg, 1),
            "misleading_count": mis,
        }
    except Exception as e:
        log.warning("[source_rating] history summary failed: %s", e)
        return None
