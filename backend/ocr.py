"""
=============================================================
OCR MODULE
File: backend/ocr.py

Handles:
- Receiving image bytes from the API
- Running EasyOCR locally for text extraction
- Returning extracted text

Fully offline after first run (model cached locally ~100 MB).
GPU is used automatically if CUDA is available.
=============================================================
"""

import concurrent.futures
import io
import logging
import threading

import numpy as np
from PIL import Image
from config import MAX_IMAGE_SIZE, ALLOWED_TYPES

log = logging.getLogger(__name__)

_reader      = None  # lazy-init — loaded on first OCR request, not at startup
_reader_lock = threading.Lock()

_OCR_TIMEOUT = 60  # seconds; large/complex images can take a long time


def _get_reader():
    global _reader
    with _reader_lock:
        if _reader is None:
            import easyocr
            import torch
            use_gpu = torch.cuda.is_available()
            log.info("OCR: loading EasyOCR model (gpu=%s) — first time only...", use_gpu)
            _reader = easyocr.Reader(["en"], gpu=use_gpu)
            log.info("OCR: EasyOCR model ready.")
        return _reader


def extract_text(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Extract all text from an image using EasyOCR (local, no API).
    Returns extracted_text and error.
    Times out after _OCR_TIMEOUT seconds to prevent runaway requests.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)

        log.info("OCR: processing %dx%d image...", img.width, img.height)

        reader = _get_reader()

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(reader.readtext, img_array, detail=0, paragraph=True)
            try:
                results = future.result(timeout=_OCR_TIMEOUT)
            except concurrent.futures.TimeoutError:
                log.warning("OCR: timed out after %ds", _OCR_TIMEOUT)
                return _error("OCR timed out. The image may be too large or complex to process.")

        text = "\n".join(results).strip()

        if not text:
            return _error("No readable text found in this image. Please upload an image containing printed text.")

        log.info("OCR: extracted %d words successfully.", len(text.split()))
        return {"extracted_text": text, "error": None}

    except Exception as e:
        return _error(f"OCR error: {str(e)}")


def _error(msg: str) -> dict:
    return {"extracted_text": "", "error": msg}
