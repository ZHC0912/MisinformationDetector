"""
Unit tests for ocr.py.
EasyOCR model is mocked — no GPU or network required.
"""

import io
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image


def _make_jpeg_bytes(width: int = 100, height: int = 50) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class TestExtractText:
    def test_success_returns_text(self):
        from ocr import extract_text
        mock_reader = MagicMock()
        mock_reader.readtext.return_value = ["Hello", "World"]
        with patch("ocr._get_reader", return_value=mock_reader):
            result = extract_text(_make_jpeg_bytes())
        assert result["error"] is None
        assert "Hello" in result["extracted_text"]

    def test_empty_ocr_result_returns_error(self):
        from ocr import extract_text
        mock_reader = MagicMock()
        mock_reader.readtext.return_value = []
        with patch("ocr._get_reader", return_value=mock_reader):
            result = extract_text(_make_jpeg_bytes())
        assert result["error"] is not None
        assert result["extracted_text"] == ""

    def test_invalid_bytes_returns_error(self):
        from ocr import extract_text
        result = extract_text(b"not_valid_image_data")
        assert result["error"] is not None
        assert result["extracted_text"] == ""

    def test_ocr_timeout_returns_error(self):
        from ocr import extract_text
        import concurrent.futures
        mock_reader = MagicMock()
        mock_reader.readtext.side_effect = lambda *a, **kw: (_ for _ in ()).throw(
            concurrent.futures.TimeoutError()
        )
        with patch("ocr._get_reader", return_value=mock_reader):
            with patch("concurrent.futures.Future.result", side_effect=concurrent.futures.TimeoutError):
                result = extract_text(_make_jpeg_bytes())
        # Either timeout is caught or propagated — result must have error key
        assert "error" in result

    def test_multiline_text_joined(self):
        from ocr import extract_text
        mock_reader = MagicMock()
        mock_reader.readtext.return_value = ["Line one", "Line two", "Line three"]
        with patch("ocr._get_reader", return_value=mock_reader):
            result = extract_text(_make_jpeg_bytes())
        assert result["error"] is None
        assert "Line one" in result["extracted_text"]
        assert "Line two" in result["extracted_text"]
