"""
=============================================================
CENTRAL CONFIGURATION
File: backend/config.py

Single source of truth for all API keys, model names,
URLs, and shared constants. Import from here — never
hardcode these values in other modules.

API keys are loaded from backend/.env (see .env.example).
=============================================================
"""

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── Gemini API ─────────────────────────────────────────────────
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
GEMINI_FC_MODEL  = "gemini-2.5-flash"
GEMINI_BASE_URL  = "https://generativelanguage.googleapis.com/v1beta/models"

# ── Google Fact Check Tools API ────────────────────────────────
GFCT_API_KEY = os.getenv("GFCT_API_KEY", "")
GFCT_URL     = "https://factchecktools.googleapis.com/v1alpha1/claims:search"

# ── Retry settings (shared by Gemini callers) ──────────────────
MAX_RETRIES  = 3
RETRY_DELAY  = 4   # seconds between attempts

# ── Global Gemini cost backstop ────────────────────────────────
# Hard ceiling on Gemini calls per calendar day across ALL users, independent
# of per-IP rate limits (which an attacker can bypass by rotating IPs). This is
# an in-process safety net; the authoritative ceiling is the Google Cloud
# billing budget + API quota you set in the console.
GEMINI_DAILY_BUDGET = int(os.getenv("GEMINI_DAILY_BUDGET", "500"))

# ── Gemini generation settings ─────────────────────────────────
GEMINI_TEMPERATURE = 0.1    # low = deterministic, factual
# NOTE: Gemini 2.5 models spend invisible "thinking" tokens from this same
# budget (observed 250–900 per fact-check). 1024 caused MAX_TOKENS-truncated
# JSON on article-length inputs → every AI fact-check failed. Keep ≥4096.
GEMINI_MAX_TOKENS  = 4096
# Cap the article text sent to Gemini — full 20k-char pastes add latency and
# tokens without improving claim verification.
GEMINI_FC_INPUT_CHARS = 8000

# ── NLP / explainability tunables ──────────────────────────────
CHUNK_WORD_LIMIT     = 180   # max words per chunk (safe margin under 256-token limit)
MISLEADING_THRESHOLD = 0.5   # P(misleading) >= this → verdict "Misleading"
                             # (fallback only — overridden at model load by
                             #  model/decision_threshold.json when present,
                             #  written by notebooks/03_train_liar_stage2.py)
LIME_NUM_SAMPLES     = 100   # LIME perturbation samples per explanation

# ── OCR settings ───────────────────────────────────────────────
MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10 MB
ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/webp", "image/gif"]

# ── MongoDB (source reliability rating + history) ──────────────
# Leave MONGODB_URI empty to disable the DB — the app degrades gracefully
# (source rating simply shows as "unrated" and no history is stored).
MONGODB_URI    = os.getenv("MONGODB_URI", "")
MONGODB_DB     = os.getenv("MONGODB_DB", "misinfo_detector")

# ── Source rating: dynamic-from-history blending ───────────────
# Once a source has >= SOURCE_MIN_HISTORY logged assessments, its rating is
# blended toward (or, for unseeded sources, driven entirely by) the observed
# average credibility. Weight on observed history grows with the assessment
# count, saturating at SOURCE_HISTORY_WEIGHT_CAP.
SOURCE_MIN_HISTORY        = 5
SOURCE_HISTORY_WEIGHT_CAP = 20
