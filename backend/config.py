"""
=============================================================
CENTRAL CONFIGURATION
File: backend/config.py

Single source of truth for all API keys, model names,
URLs, and shared constants. Import from here — never
hardcode these values in other modules.
=============================================================
"""

# ── Gemini API ─────────────────────────────────────────────────
# NOTE: Keys are hardcoded for local FYP demo only.
# Production deployment should load these from environment variables or a .env file.
GEMINI_API_KEY   = "AIzaSyDSDqRlTZx-_qDYDXsNXsfAAfCLYJHHj1A"
GEMINI_FC_MODEL  = "gemini-2.5-flash"   # used for fact-checking
GEMINI_OCR_MODEL = "gemini-2.5-flash"   # used for OCR (vision)
GEMINI_BASE_URL  = "https://generativelanguage.googleapis.com/v1beta/models"

# ── Google Fact Check Tools API ────────────────────────────────
GFCT_API_KEY = "AIzaSyDZQofHTvtQgiqJbSQ-4uK8wI3uNkk_xK8"
GFCT_URL     = "https://factchecktools.googleapis.com/v1alpha1/claims:search"

# ── Retry settings (shared by Gemini callers) ──────────────────
MAX_RETRIES  = 3
RETRY_DELAY  = 4   # seconds between attempts

# ── OCR settings ───────────────────────────────────────────────
MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10 MB
ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/webp", "image/gif"]
