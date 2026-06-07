"""
Unit tests for scraper.py.
External network calls are mocked — no real HTTP requests.
"""

import pytest
from unittest.mock import patch, MagicMock
from scraper import scrape_url, MAX_TEXT_LENGTH


class TestScrapeUrl:
    def test_returns_error_when_download_fails(self):
        with patch("scraper.trafilatura.fetch_url", return_value=None):
            result = scrape_url("https://example.com/article")
        assert result["error"] is not None
        assert result["text"] == ""

    def test_returns_error_when_extraction_returns_none(self):
        with patch("scraper.trafilatura.fetch_url", return_value=b"<html></html>"):
            with patch("scraper.trafilatura.extract", return_value=None):
                result = scrape_url("https://example.com/article")
        assert result["error"] is not None

    def test_returns_error_when_text_too_short(self):
        with patch("scraper.trafilatura.fetch_url", return_value=b"<html></html>"):
            with patch("scraper.trafilatura.extract", return_value="Hi"):
                result = scrape_url("https://example.com/article")
        assert result["error"] is not None

    def test_success_path_returns_expected_keys(self):
        mock_text = "This is a real article. " * 20
        meta = MagicMock()
        meta.title    = "Test Article"
        meta.sitename = "Test Site"
        with patch("scraper.trafilatura.fetch_url", return_value=b"content"):
            with patch("scraper.trafilatura.extract", return_value=mock_text):
                with patch("scraper.trafilatura.extract_metadata", return_value=meta):
                    result = scrape_url("https://example.com/article")
        assert result["error"] is None
        assert result["text"] == mock_text
        assert result["title"] == "Test Article"
        assert result["word_count"] > 0
        assert result["char_count"] == len(mock_text)

    def test_truncates_text_over_limit(self):
        long_text = "word " * 5000  # 25 000 chars
        meta = MagicMock()
        meta.title    = ""
        meta.sitename = ""
        with patch("scraper.trafilatura.fetch_url", return_value=b"content"):
            with patch("scraper.trafilatura.extract", return_value=long_text):
                with patch("scraper.trafilatura.extract_metadata", return_value=meta):
                    result = scrape_url("https://example.com/article")
        assert len(result["text"]) <= MAX_TEXT_LENGTH

    def test_exception_returns_error(self):
        with patch("scraper.trafilatura.fetch_url", side_effect=Exception("network failure")):
            result = scrape_url("https://example.com/article")
        assert result["error"] is not None
        assert "network failure" in result["error"]
