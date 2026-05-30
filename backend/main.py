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

import re
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

_URL_RE = re.compile(r'^https?://.+\..+', re.IGNORECASE)

import textanalysis
import factcheck
import ocr
import scraper
import evaluation
from fc_gemini import fact_check_gemini

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

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:3000", "http://localhost:3001"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Request / Response schemas ────────────────────────────────
class AnalyseRequest(BaseModel):
    text:        str = Field(..., min_length=20, max_length=20000,
                             description="Article or post text to analyse")
    source_name: str = Field(default="Unknown",
                             description="Name of the source (optional)")

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
async def analyse(request: AnalyseRequest):
    """
    Analyse article text for credibility.

    Runs two analyses in sequence:
    1. DistilBERT NLP — checks writing style and linguistic patterns
    2. Gemini — checks factual accuracy of the claims

    Returns combined verdict with full explanation.
    """
    start_time = time.time()

    print(f"\n--- New analysis request ---")
    print(f"Source: {request.source_name}")
    print(f"Text length: {len(request.text)} characters")

    # Step 1: NLP analysis
    print("Step 1: Running NLP analysis...")
    nlp_result = textanalysis.analyse(request.text)

    # Step 2: LIME explainability
    print("Step 2: Running LIME explainability...")
    lime_result = textanalysis.explain_with_lime(request.text)

    # Step 3: Fact-check
    print("Step 3: Running fact-check...")
    fc_result = factcheck.fact_check(request.text)

    # Step 4: Combine
    final_verdict, final_explanation = factcheck.combine_verdicts(
        nlp_result["style_verdict"], nlp_result["confidence"],
        fc_result["verdict"],        fc_result["confidence"],
        fc_result["fact_check_source"],
    )

    processing_time = round(time.time() - start_time, 3)
    print(f"Done in {processing_time}s — Final verdict: {final_verdict}")

    return AnalyseResponse(
        style_verdict     = nlp_result["style_verdict"],
        confidence        = nlp_result["confidence"],
        credibility_score = nlp_result["credibility_score"],
        misleading_prob   = nlp_result["misleading_prob"],
        reliable_prob     = nlp_result["reliable_prob"],
        key_features      = nlp_result["key_features"],
        style_explanation = nlp_result["style_explanation"],
        lime_explanation  = lime_result,
        fact_check        = FactCheckResult(**fc_result),
        final_verdict     = final_verdict,
        final_explanation = final_explanation,
        chunks            = nlp_result["chunks"],
        processing_time   = processing_time,
        source_name       = request.source_name,
        mode              = nlp_result["mode"],
    )


@app.post("/extract-text", response_model=OCRResponse, tags=["OCR"])
async def extract_text(file: UploadFile = File(...)):
    """
    Extract text from an uploaded image using Gemini Vision OCR.

    Supported formats: JPG, PNG, WEBP, GIF
    Maximum file size: 10MB
    """
    # Validate file type
    content_type = file.content_type or "image/jpeg"
    if content_type not in ocr.ALLOWED_TYPES:
        raise HTTPException(
            status_code = 400,
            detail      = f"Unsupported file type: {content_type}. Please upload JPG, PNG, WEBP, or GIF."
        )

    # Read and validate size
    image_bytes = await file.read()
    if len(image_bytes) > ocr.MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code = 400,
            detail      = "Image too large. Maximum size is 10MB."
        )

    print(f"\n--- OCR request: {file.filename} ({len(image_bytes)} bytes) ---")

    result = ocr.extract_text(image_bytes, content_type)

    return OCRResponse(
        extracted_text = result["extracted_text"],
        error          = result["error"],
        char_count     = len(result["extracted_text"]),
        word_count     = len(result["extracted_text"].split()) if result["extracted_text"] else 0
    )


@app.post("/scrape-url", response_model=ScrapeResponse, tags=["Scraper"])
async def scrape_url(request: ScrapeRequest):
    """
    Fetch and extract the main article text from a URL.

    Uses trafilatura to extract the article body, title, and site name.
    The extracted text can then be passed to /analyse for credibility assessment.
    """
    url = request.url.strip()
    if not _URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")

    print(f"\n--- Scrape request: {url} ---")
    result = scraper.scrape_url(url)
    print(f"Scraped {result['word_count']} words — error: {result['error']}")
    return ScrapeResponse(**result)


@app.post("/fact-check-ai", response_model=AiFactCheckResponse, tags=["Analysis"])
async def fact_check_ai(request: AiFactCheckRequest):
    """
    Run an AI (Gemini) fact-check on demand.

    Called when the Google Fact Check API found no indexed records and
    the user explicitly opts in to an AI-assisted check.
    Returns the Gemini result plus an updated combined verdict.
    """
    print(f"\n--- AI fact-check request (user opt-in) ---")
    fc_result = fact_check_gemini(request.text)
    final_verdict, final_explanation = factcheck.combine_verdicts(
        request.style_verdict,    request.style_confidence,
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
        "ocr_model":        f"Gemini Vision — {ocr.GEMINI_OCR_MODEL}",
        "task":             "Binary classification + factual verification + image OCR",
        "framework":        "Hugging Face Transformers + PyTorch + Google Gemini API",
        "api_version":      "3.0.0"
    }


# ── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
