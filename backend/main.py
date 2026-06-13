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
import logging
import re
import time
from contextlib import asynccontextmanager

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

import textanalysis
import factcheck
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

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:3000", "http://localhost:3001"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Request / Response schemas ────────────────────────────────
class AnalyseRequest(BaseModel):
    text:        str  = Field(..., min_length=20, max_length=20000,
                              description="Article or post text to analyse")
    source_name: str  = Field(default="Unknown",
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
            "evaluate":     "GET  /evaluate     — run model evaluation (LIAR benchmark)",
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

    # Step 4b: source reliability rating + history (MongoDB; null if disabled/unknown)
    src_rating = source_rating.get_rating(body.source_name)
    source_rating.record_assessment(body.source_name, final_verdict, nlp_result["credibility_score"])

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

    image_bytes = await file.read()
    if len(image_bytes) > ocr.MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code = 400,
            detail      = "Image too large. Maximum size is 10MB."
        )

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
async def run_evaluation():
    """
    Evaluate the NLP classifier against the LIAR benchmark test set (896 items).
    Returns accuracy, F1, AUC-ROC, confusion matrix, per-class metrics, and ROC curve.
    """
    try:
        return evaluation.run_evaluation()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


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
