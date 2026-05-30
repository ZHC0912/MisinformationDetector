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

import io
import numpy as np
from PIL import Image
from config import MAX_IMAGE_SIZE, ALLOWED_TYPES

_reader = None  # lazy-init — loaded on first OCR request, not at startup


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        import torch
        use_gpu = torch.cuda.is_available()
        print(f"OCR: loading EasyOCR model (gpu={use_gpu}) — first time only...")
        _reader = easyocr.Reader(["en"], gpu=use_gpu)
        print("OCR: EasyOCR model ready.")
    return _reader


def extract_text(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Extract all text from an image using EasyOCR (local, no API).
    Returns extracted_text and error.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)

        print(f"OCR: processing {img.width}x{img.height} image...")

        results = _get_reader().readtext(img_array, detail=0, paragraph=True)
        text = "\n".join(results).strip()

        if not text:
            return _error("No readable text found in this image. Please upload an image containing printed text.")

        print(f"OCR: extracted {len(text.split())} words successfully.")
        return {"extracted_text": text, "error": None}

    except Exception as e:
        return _error(f"OCR error: {str(e)}")


def _error(msg: str) -> dict:
    return {"extracted_text": "", "error": msg}
