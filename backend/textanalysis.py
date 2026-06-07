"""
=============================================================
TEXT ANALYSIS MODULE
File: backend/textanalysis.py

Handles:
- Loading DistilBERT model
- Running predictions on article text
- Extracting key linguistic features
- Generating NLP explanation
=============================================================
"""

import concurrent.futures
import json
import logging
import os
import random
import re
import threading

import numpy as np

# torch and transformers are heavy — imported lazily inside load_model()
# so the module can be imported even when those packages are not installed.
torch = None
DistilBertTokenizerFast = None
DistilBertForSequenceClassification = None

log = logging.getLogger(__name__)

# ── Model state (loaded once at startup) ─────────────────────
_tokenizer = None
_model     = None
_label_map = {"0": "Reliable", "1": "Misleading"}
MODEL_PATH = "./model"

_model_lock = threading.Lock()   # guards _tokenizer / _model during lazy-init
_lime_lock  = threading.Lock()   # guards _lime_explainer during lazy-init

_CHUNK_WORD_LIMIT = 180  # safe margin below DistilBERT's 256-token max

WARNING_WORDS = [
    "shocking", "exposed", "breaking", "leaked", "bombshell",
    "secret", "banned", "deleted", "share now", "urgent",
    "miracle", "they don't want", "government hiding", "doctors hate",
    "real truth", "wake up", "false flag", "deep state", "plandemic",
    "microchip", "5g", "chemtrail", "hoax", "conspiracy", "cover-up",
    "proof", "admits", "reveals", "exposes", "you won't believe",
    "mainstream media won't tell", "before it's deleted",
    "what they don't want you to know", "share before removed",
]

CREDIBLE_WORDS = [
    "according to", "published", "study", "research", "data",
    "statistics", "report", "announced", "confirmed", "said",
    "stated", "percent", "analysis", "findings", "researchers",
    "scientists", "survey", "evidence", "review", "cited",
    "peer-reviewed", "official", "statement", "spokesperson",
]


def load_model() -> bool:
    """Load DistilBERT model from disk. Returns True if successful."""
    global _tokenizer, _model, _label_map, torch, DistilBertTokenizerFast, DistilBertForSequenceClassification

    if not os.path.exists(MODEL_PATH):
        log.warning("No model found at %s. Using heuristic mode.", MODEL_PATH)
        return False

    with _model_lock:
        if _model is not None:
            return True
        import torch as _torch
        from transformers import (
            DistilBertTokenizerFast as _Tokenizer,
            DistilBertForSequenceClassification as _Model,
        )
        torch = _torch
        DistilBertTokenizerFast = _Tokenizer
        DistilBertForSequenceClassification = _Model

        log.info("Loading DistilBERT model from %s...", MODEL_PATH)
        _tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_PATH)
        _model     = DistilBertForSequenceClassification.from_pretrained(MODEL_PATH)
        _model.eval()

        label_map_path = os.path.join(MODEL_PATH, "label_map.json")
        if os.path.exists(label_map_path):
            with open(label_map_path) as f:
                _label_map = json.load(f)

    log.info("DistilBERT model loaded successfully.")
    return True


def is_model_loaded() -> bool:
    return _model is not None and _tokenizer is not None


def _split_into_chunks(text: str) -> list:
    """
    Split text into sentence-boundary chunks, each under _CHUNK_WORD_LIMIT words.
    Keeps sentences whole — never cuts mid-sentence.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks, current, current_words = [], [], 0

    for sentence in sentences:
        w = len(sentence.split())
        if current_words + w > _CHUNK_WORD_LIMIT and current:
            chunks.append(" ".join(current))
            current, current_words = [sentence], w
        else:
            current.append(sentence)
            current_words += w

    if current:
        chunks.append(" ".join(current))

    return chunks


def _predict_single(text: str) -> dict:
    """Run one DistilBERT forward pass. Caller must ensure model is loaded."""
    import torch as _torch
    inputs = _tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256,
    )
    with _torch.no_grad():
        probs = _torch.softmax(_model(**inputs).logits, dim=1).squeeze()
    return {"reliable_prob": float(probs[0]), "misleading_prob": float(probs[1])}


def predict(text: str) -> dict:
    """
    Run credibility prediction on article text.
    Long texts are split into sentence-boundary chunks; each chunk is scored
    independently and probabilities are averaged across all chunks.
    Uses real DistilBERT if loaded, else heuristic fallback.
    """
    if not is_model_loaded():
        return _heuristic_predict(text)

    try:
        word_count = len(text.split())

        if word_count <= _CHUNK_WORD_LIMIT:
            result = _predict_single(text)
            return {**result, "mode": "AI model", "chunks": []}

        chunks  = _split_into_chunks(text)
        results = [_predict_single(chunk) for chunk in chunks]
        avg_misleading = sum(r["misleading_prob"] for r in results) / len(results)
        log.info("[NLP] Chunked inference: %d chunks, avg misleading=%.3f", len(chunks), avg_misleading)
        chunks_out = [
            {
                "text":            chunk,
                "misleading_prob": round(r["misleading_prob"], 4),
                "reliable_prob":   round(r["reliable_prob"],   4),
                "verdict":         "Misleading" if r["misleading_prob"] >= 0.5 else "Reliable",
            }
            for chunk, r in zip(chunks, results)
        ]
        return {
            "reliable_prob":   round(1.0 - avg_misleading, 4),
            "misleading_prob": round(avg_misleading, 4),
            "mode":            f"AI model · {len(chunks)} chunks",
            "chunks":          chunks_out,
        }
    except Exception as e:
        log.error("[NLP] Model prediction failed: %s. Falling back to heuristic.", e)
        return _heuristic_predict(text)


def _heuristic_predict(text: str) -> dict:
    """Fallback when model is not loaded — keyword-based heuristic."""
    random.seed(hash(text) % 1000)
    text_lower    = text.lower()
    warning_count = sum(1 for w in WARNING_WORDS if w in text_lower)

    if warning_count >= 2:
        misleading_prob = min(0.75 + random.random() * 0.20, 0.99)
    elif warning_count == 1:
        misleading_prob = 0.50 + random.random() * 0.25
    else:
        misleading_prob = 0.10 + random.random() * 0.35

    return {
        "reliable_prob":   round(1.0 - misleading_prob, 4),
        "misleading_prob": round(misleading_prob, 4),
        "mode":            "heuristic",
        "chunks":          [],
    }


def extract_features(text: str, misleading_prob: float) -> list:
    """Extract key linguistic features from text."""
    text_lower = text.lower()
    features   = []

    for word in WARNING_WORDS:
        if word in text_lower:
            features.append({
                "word":  word,
                "score": round(0.3 + misleading_prob * 0.5, 3),
                "type":  "warning"
            })

    for word in CREDIBLE_WORDS:
        if word in text_lower:
            features.append({
                "word":  word,
                "score": round(0.2 + (1 - misleading_prob) * 0.3, 3),
                "type":  "credible"
            })

    features.sort(key=lambda x: x["score"], reverse=True)
    return features[:8]


def generate_explanation(verdict: str, confidence: float,
                          credibility_score: int, features: list) -> str:
    """Generate plain-English NLP explanation."""
    warning_count  = sum(1 for f in features if f["type"] == "warning")
    credible_count = sum(1 for f in features if f["type"] == "credible")

    exp = (f"Writing style analysis: {verdict} "
           f"({confidence*100:.1f}% confidence, "
           f"credibility score {credibility_score}/100). ")

    if warning_count > 0:
        ww = [f["word"] for f in features if f["type"] == "warning"][:3]
        exp += f"Warning linguistic patterns detected: {', '.join(ww)}. "

    if credible_count > 0:
        cw = [f["word"] for f in features if f["type"] == "credible"][:3]
        exp += f"Credible linguistic patterns detected: {', '.join(cw)}. "

    if warning_count == 0 and credible_count == 0:
        exp += "No strong warning or credibility patterns detected in the language. "

    return exp.strip()


_lime_explainer = None  # lazy-initialised on first explain_with_lime() call

_LIME_TIMEOUT = 30  # seconds; LIME can stall on long or unusual texts

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "was", "are", "were", "be", "been",
    "that", "this", "it", "its", "as", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "not", "no",
    "so", "if", "than", "then", "their", "they", "we", "he", "she", "his",
    "her", "our", "your", "my", "into", "also", "more", "about", "up",
}


def _lime_batch_predict(texts: list) -> np.ndarray:
    """
    Batch prediction function for LIME. Accepts a list of perturbed text
    strings and returns an (n, 2) probability array [reliable, misleading].
    Batching reduces forward passes from num_samples to num_samples/batch_size.
    """
    if _tokenizer is None or _model is None:
        return np.full((len(texts), 2), 0.5)
    import torch as _torch
    results = []
    batch_size = 16
    for i in range(0, len(texts), batch_size):
        batch  = texts[i : i + batch_size]
        inputs = _tokenizer(
            batch,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=128,   # shorter limit keeps LIME fast
        )
        with _torch.no_grad():
            probs = _torch.softmax(_model(**inputs).logits, dim=1).numpy()
        results.extend(probs)
    return np.array(results)


def explain_with_lime(text: str, num_features: int = 10) -> list:
    """
    Use LIME to identify which words most influenced the DistilBERT verdict.

    Returns a list of dicts sorted by influence strength:
      word      — the word from the text
      score     — raw LIME score (positive = toward Misleading)
      direction — "misleading" or "reliable"
      strength  — normalised 0-1 (for rendering bar width)

    Returns empty list if the model is not loaded (heuristic mode) or if LIME
    times out (> _LIME_TIMEOUT seconds).
    """
    global _lime_explainer
    if not is_model_loaded():
        return []

    with _lime_lock:
        if _lime_explainer is None:
            try:
                from lime.lime_text import LimeTextExplainer
                _lime_explainer = LimeTextExplainer(class_names=["Reliable", "Misleading"])
            except ImportError:
                log.warning("[LIME] lime package not installed — explainability unavailable")
                return []
        local_explainer = _lime_explainer

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                local_explainer.explain_instance,
                text,
                _lime_batch_predict,
                num_features=num_features,
                num_samples=100,
                labels=[1],
            )
            try:
                exp = future.result(timeout=_LIME_TIMEOUT)
            except concurrent.futures.TimeoutError:
                log.warning("[LIME] Explanation timed out after %ds — skipping", _LIME_TIMEOUT)
                return []

        word_scores = exp.as_list(label=1)
        if not word_scores:
            return []

        # Filter out stopwords and single characters before scoring
        word_scores = [
            (w, s) for w, s in word_scores
            if w.lower() not in _STOPWORDS and len(w) > 2
        ]
        if not word_scores:
            return []

        max_abs = max(abs(s) for _, s in word_scores) or 1.0

        result = []
        for word, score in word_scores:
            result.append({
                "word":      word,
                "score":     round(float(score), 4),
                "direction": "misleading" if score > 0 else "reliable",
                "strength":  round(abs(score) / max_abs, 4),
            })

        result.sort(key=lambda x: abs(x["score"]), reverse=True)
        return result

    except Exception as e:
        log.error("[LIME] Explanation failed: %s", e)
        return []


def analyse(text: str) -> dict:
    """
    Full text analysis pipeline.
    Returns all NLP results ready for API response.
    """
    prediction        = predict(text)
    misleading_prob   = prediction["misleading_prob"]
    reliable_prob     = prediction["reliable_prob"]
    verdict           = "Misleading" if misleading_prob >= 0.5 else "Reliable"
    confidence        = round(max(misleading_prob, reliable_prob), 4)
    credibility_score = int(reliable_prob * 100)
    features          = extract_features(text, misleading_prob)
    explanation       = generate_explanation(verdict, confidence, credibility_score, features)

    return {
        "style_verdict":     verdict,
        "confidence":        confidence,
        "credibility_score": credibility_score,
        "misleading_prob":   round(misleading_prob, 4),
        "reliable_prob":     round(reliable_prob, 4),
        "key_features":      features,
        "style_explanation": explanation,
        "mode":              prediction["mode"],
        "chunks":            prediction["chunks"],
    }
