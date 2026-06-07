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

# ── OCR settings ───────────────────────────────────────────────
MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10 MB
ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/webp", "image/gif"]
