"""
=============================================================
MAIN BACKEND — FASTAPI ROUTES ONLY
File: backend/main.py

This file contains ONLY:
- App setup and CORS
- API endpoint definitions
- Lifespan: loads model on startup

All logic is in separate modules:
- textanalysis.py  → DistilBERT NLP analysis
- factcheck.py     → Google GFCT fact-checking + verdict combining
- ocr.py           → Image text extraction

Run with:
  python main.py
  OR
  uvicorn main:app --host 127.0.0.1 --port 8000
=============================================================
"""

import asyncio
import ipaddress
import logging
import os
import re
import socket
import time
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt = "%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

_URL_RE = re.compile(r'^https?://.+\..+', re.IGNORECASE)


def _is_safe_public_url(url: str) -> bool:
    """
    SSRF guard for /scrape-url: allow only http/https to a PUBLIC IP.
    Rejects loopback / private / link-local / reserved ranges so the server
    can't be used to fetch internal services or cloud-metadata endpoints
    (e.g. http://169.254.169.254/, http://127.0.0.1:8000/, http://10.0.0.5/).
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True


# Source names we treat as "no real source" — blank or placeholder. Analyses with
# these are NEITHER looked up in NOR written to the source-history collection, so
# anonymous / blank-source submissions can't pool together under one "unknown" key
# and fabricate a history-based rating for the next blank-source user
# (see source_rating.get_rating's seed+history blending).
_UNKNOWN_SOURCE_NAMES = {"", "unknown", "unknown source"}


def _is_named_source(source_name: str) -> bool:
    """True only when a specific, non-placeholder source name was provided."""
    return (source_name or "").strip().lower() not in _UNKNOWN_SOURCE_NAMES


import textanalysis
import factcheck
import factcheck_feed
import ocr
import scraper
import evaluation
import source_rating
from fc_gemini import fact_check_gemini

# ── Rate limiter ───────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    textanalysis.load_model()
    yield

# ── App setup ─────────────────────────────────────────────────
app = FastAPI(
    title       = "Misinformation Detection API",
    description = "AI credibility assessment — DistilBERT NLP + Gemini Fact-Check + OCR",
    version     = "3.0.0",
    lifespan    = lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Log latency for every request — evidence for the ≤5s response-time NFR
@app.middleware("http")
async def log_request_time(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    log.info("%s %s → %d in %.3fs", request.method, request.url.path, response.status_code, duration)
    response.headers["X-Process-Time"] = f"{duration:.3f}"
    return response

# Allowed browser origins — override in production via CORS_ORIGINS (comma-separated).
_cors_origins = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins     = _cors_origins,
    allow_credentials = False,          # no cookies/auth are used — keep this off
    allow_methods     = ["GET", "POST"],
    allow_headers     = ["*"],
)

# ── Request / Response schemas ────────────────────────────────
class AnalyseRequest(BaseModel):
    text:        str  = Field(..., min_length=20, max_length=20000,
                              description="Article or post text to analyse")
    source_name: str  = Field(default="Unknown Source", max_length=200,
                              description="Name of the source (optional)")
    run_lime:    bool = Field(default=False,
                              description="Run LIME word-influence explainability (adds ~5-10s)")
    run_shap:    bool = Field(default=False,
                              description="Run SHAP word-influence explainability (adds ~10-45s)")

class FactCheckResult(BaseModel):
    verdict:          str
    confidence:       float
    summary:          str
    explanation:      str
    sources:          list
    claim_extracted:  str
    error:            str | None
    fact_check_source: str

class AnalyseResponse(BaseModel):
    # NLP results
    style_verdict:     str
    confidence:        float
    credibility_score: int
    misleading_prob:   float
    reliable_prob:     float
    key_features:      list
    style_explanation: str
    # Explainability
    lime_explanation:  list
    shap_explanation:  list
    # Source reliability rating (FR5 — null when source unknown / DB disabled)
    source_rating:     dict | None
    # Fact-check results
    fact_check:        FactCheckResult
    # Combined
    final_verdict:     str
    final_explanation: str
    # Chunk-level breakdown (empty list when text is short enough for single pass)
    chunks:            list
    # Meta
    processing_time:   float
    source_name:       str
    mode:              str
    heuristic_mode:    bool

class OCRResponse(BaseModel):
    extracted_text: str
    error:          str | None
    char_count:     int
    word_count:     int

class ScrapeRequest(BaseModel):
    url: str = Field(..., description="URL of the news article to fetch")

class ScrapeResponse(BaseModel):
    text:      str
    title:     str
    site_name: str
    error:     str | None
    char_count: int
    word_count: int

class AiFactCheckRequest(BaseModel):
    text:             str   = Field(..., min_length=20, max_length=20000)
    style_verdict:    str
    style_confidence: float

class AiFactCheckResponse(BaseModel):
    fact_check:        FactCheckResult
    final_verdict:     str
    final_explanation: str

# ── Routes ────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    """Health check — confirms API is running."""
    return {
        "status":       "running",
        "version":      "3.0.0",
        "model_loaded": textanalysis.is_model_loaded(),
        "docs":         "http://127.0.0.1:8000/docs",
        "endpoints": {
            "analyse":      "POST /analyse      — analyse article text",
            "scrape_url":   "POST /scrape-url   — fetch and extract article from URL",
            "extract_text": "POST /extract-text — extract text from image",
            "evaluate":     "GET  /evaluate        — read latest saved evaluation (LIAR benchmark)",
            "evaluate_rerun": "POST /evaluate/rerun — run a fresh evaluation + persist it",
            "model_info":   "GET  /model-info   — model details",
        }
    }


@app.post("/analyse", response_model=AnalyseResponse, tags=["Analysis"])
@limiter.limit("10/minute")
async def analyse(request: Request, body: AnalyseRequest):
    """
    Analyse article text for credibility.

    The network fact-check (Google GFCT) runs CONCURRENTLY with the GPU pipeline
    (DistilBERT NLP + optional LIME/SHAP) via asyncio.gather, so the fact-check
    latency is hidden under the model work. GPU tasks stay sequential within the
    pipeline to avoid contention / VRAM OOM on a 4 GB GPU.

    Returns combined verdict with full explanation.
    Rate limited to 10 requests/minute per IP.
    """
    start_time = time.time()

    log.info("New analysis — source=%s len=%d lime=%s shap=%s",
             body.source_name, len(body.text), body.run_lime, body.run_shap)

    # GPU pipeline: NLP, then optional LIME/SHAP — run sequentially (shared GPU).
    async def _gpu_pipeline():
        nlp = await run_in_threadpool(textanalysis.analyse, body.text)
        lime = (await run_in_threadpool(textanalysis.explain_with_lime, body.text)
                if body.run_lime else [])
        shap = (await run_in_threadpool(textanalysis.explain_with_shap, body.text)
                if body.run_shap else [])
        return nlp, lime, shap

    # Run the GPU pipeline and the (network-bound) fact-check at the same time.
    (nlp_result, lime_result, shap_result), fc_result = await asyncio.gather(
        _gpu_pipeline(),
        run_in_threadpool(factcheck.fact_check, body.text),
    )

    # Step 4: Combine
    final_verdict, final_explanation = factcheck.combine_verdicts(
        nlp_result["style_verdict"], nlp_result["confidence"],
        fc_result["verdict"],        fc_result["confidence"],
        fc_result["fact_check_source"],
    )

    # Step 4b: source reliability rating + history (MongoDB; null if disabled/unknown).
    # Skip BOTH the lookup and the history write for blank / placeholder sources so
    # anonymous submissions never pool under one key and produce a bogus rating.
    if _is_named_source(body.source_name):
        src_rating = source_rating.get_rating(body.source_name)
        source_rating.record_assessment(body.source_name, final_verdict, nlp_result["credibility_score"])
    else:
        src_rating = None

    processing_time = round(time.time() - start_time, 3)
    heuristic_mode  = nlp_result["mode"] == "heuristic"
    log.info("Done in %.3fs — final=%s heuristic=%s", processing_time, final_verdict, heuristic_mode)

    return AnalyseResponse(
        style_verdict     = nlp_result["style_verdict"],
        confidence        = nlp_result["confidence"],
        credibility_score = nlp_result["credibility_score"],
        misleading_prob   = nlp_result["misleading_prob"],
        reliable_prob     = nlp_result["reliable_prob"],
        key_features      = nlp_result["key_features"],
        style_explanation = nlp_result["style_explanation"],
        lime_explanation  = lime_result,
        shap_explanation  = shap_result,
        source_rating     = src_rating,
        fact_check        = FactCheckResult(**fc_result),
        final_verdict     = final_verdict,
        final_explanation = final_explanation,
        chunks            = nlp_result["chunks"],
        processing_time   = processing_time,
        source_name       = body.source_name,
        mode              = nlp_result["mode"],
        heuristic_mode    = heuristic_mode,
    )


@app.post("/extract-text", response_model=OCRResponse, tags=["OCR"])
@limiter.limit("20/minute")
async def extract_text(request: Request, file: UploadFile = File(...)):
    """
    Extract text from an uploaded image using EasyOCR.

    Supported formats: JPG, PNG, WEBP, GIF
    Maximum file size: 10MB
    Rate limited to 20 requests/minute per IP.
    """
    content_type = file.content_type or "image/jpeg"
    if content_type not in ocr.ALLOWED_TYPES:
        raise HTTPException(
            status_code = 400,
            detail      = f"Unsupported file type: {content_type}. Please upload JPG, PNG, WEBP, or GIF."
        )

    # Enforce the size cap WHILE streaming, before the whole body is buffered —
    # otherwise a multi-GB upload is read fully into memory before we reject it.
    buf = bytearray()
    while chunk := await file.read(64 * 1024):
        buf += chunk
        if len(buf) > ocr.MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code = 400,
                detail      = "Image too large. Maximum size is 10MB."
            )
    image_bytes = bytes(buf)

    log.info("OCR request: %s (%d bytes)", file.filename, len(image_bytes))

    result = ocr.extract_text(image_bytes, content_type)

    return OCRResponse(
        extracted_text = result["extracted_text"],
        error          = result["error"],
        char_count     = len(result["extracted_text"]),
        word_count     = len(result["extracted_text"].split()) if result["extracted_text"] else 0
    )


@app.post("/scrape-url", response_model=ScrapeResponse, tags=["Scraper"])
@limiter.limit("20/minute")
async def scrape_url(request: Request, body: ScrapeRequest):
    """
    Fetch and extract the main article text from a URL.

    Uses trafilatura to extract the article body, title, and site name.
    Rate limited to 20 requests/minute per IP.
    """
    url = body.url.strip()
    if not _URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")
    if not _is_safe_public_url(url):
        raise HTTPException(
            status_code=400,
            detail="This URL cannot be fetched. Only public http/https addresses are allowed.")

    log.info("Scrape request: %s", url)
    result = scraper.scrape_url(url)
    log.info("Scraped %d words — error: %s", result["word_count"], result["error"])
    return ScrapeResponse(**result)


@app.post("/fact-check-ai", response_model=AiFactCheckResponse, tags=["Analysis"])
@limiter.limit("5/minute")
async def fact_check_ai(request: Request, body: AiFactCheckRequest):
    """
    Run an AI (Gemini) fact-check on demand.

    Called when the Google Fact Check API found no indexed records and
    the user explicitly opts in to an AI-assisted check.
    Rate limited to 5 requests/minute per IP to protect Gemini quota.
    """
    log.info("AI fact-check request (user opt-in)")
    fc_result = fact_check_gemini(body.text)
    final_verdict, final_explanation = factcheck.combine_verdicts(
        body.style_verdict,    body.style_confidence,
        fc_result["verdict"],     fc_result["confidence"],
        fc_result["fact_check_source"],
    )
    return AiFactCheckResponse(
        fact_check        = FactCheckResult(**fc_result),
        final_verdict     = final_verdict,
        final_explanation = final_explanation,
    )


@app.get("/evaluate", tags=["Evaluation"])
async def get_evaluation():
    """
    Return the most recently PERSISTED evaluation result instantly — no re-run.

    Reads backend/liar_test_metrics.json (written by POST /evaluate/rerun or by
    running evaluation.py directly). Returns {"available": false} if no evaluation
    has ever been persisted, so the dashboard can show an empty state instead of
    erroring on a fresh clone.
    """
    saved = evaluation.load_saved_result()
    if saved is None:
        return {"available": False}
    return saved


@app.post("/evaluate/rerun", tags=["Evaluation"])
@limiter.limit("5/minute")
async def rerun_evaluation(request: Request):
    """
    Run a FRESH evaluation against the LIAR benchmark test set (896 items),
    overwrite the persisted result, and return it.

    Expensive: loads the model and runs 896 inferences — hence rate-limited and
    run off the event loop. Returns accuracy, F1, AUC-ROC, confusion matrix,
    per-class metrics, and ROC curve.
    """
    try:
        result = await run_in_threadpool(evaluation.run_evaluation)
        return evaluation.save_result(result)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Evaluation dataset or model is not available.")
    except Exception:
        log.exception("Evaluation failed")
        raise HTTPException(status_code=500, detail="Evaluation failed. Please try again later.")


@app.get("/api/fact-checks", tags=["Feed"])
@limiter.limit("30/minute")
async def api_fact_checks(
    request: Request,
    query: str = "",
    region: str = "malaysia",
    lang: str = "en",
):
    """
    Public "Recently fact-checked" feed of ATTRIBUTED claims (named speaker) from
    Google's Fact Check Tools API (ClaimReview corpus).

    - `region` ('malaysia' | 'foreign') selects a section when `query` is blank;
      only the requested section is fetched (the frontend lazy-loads regions).
    - `query` (navbar search) overrides the region and searches the whole corpus.

    The Google API key is used server-side only and never reaches the browser.
    Each section is cached (2h) to respect API quota and capped at 8 cards.
    Ordered by review recency — the API exposes no popularity/"trending" signal.

    Rate limited to 30 requests/minute per IP.
    """
    items = await run_in_threadpool(
        factcheck_feed.get_fact_checks, query, region, lang
    )
    return {
        "query":       query.strip(),
        "region":      region,
        "count":       len(items),
        "items":       items,
        "attribution": "Google Fact Check Tools API — ClaimReview corpus",
    }


@app.get("/api/sources", tags=["Feed"])
@limiter.limit("30/minute")
async def api_sources(request: Request):
    """
    Seeded source-reliability ratings (FR5) for the reliability sidebar.

    Real data owned by this project: Media Bias/Fact Check-style factual-reporting
    tiers stored in MongoDB (falls back to the on-disk seed file if the DB is
    disabled). Ordered best-rated first. No invented aggregate percentages.

    Rate limited to 30 requests/minute per IP.
    """
    sources = await run_in_threadpool(source_rating.list_seeded_ratings)
    return {"count": len(sources), "sources": sources}


@app.get("/model-info", tags=["Health"])
async def model_info():
    """Returns information about the loaded models."""
    return {
        "nlp_model":        "DistilBERT (distilbert-base-uncased) fine-tuned on ISOT dataset",
        "nlp_model_loaded": textanalysis.is_model_loaded(),
        "fact_check_model": f"Gemini API — {factcheck.GEMINI_FC_MODEL}",
        "ocr_model":        "EasyOCR (local, offline)",
        "task":             "Binary classification + factual verification + image OCR",
        "framework":        "Hugging Face Transformers + PyTorch + Google Gemini API",
        "api_version":      "3.0.0"
    }


# ── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
