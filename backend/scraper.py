"""
=============================================================
URL ARTICLE SCRAPER
File: backend/scraper.py

Uses trafilatura to fetch and extract the main article body,
title, and site name from a given URL.
=============================================================
"""

import trafilatura

MAX_TEXT_LENGTH = 20000


def scrape_url(url: str) -> dict:
    empty = {"text": "", "title": "", "site_name": "", "char_count": 0, "word_count": 0}
    try:
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return {
                **empty,
                "error": (
                    "Could not download the page. The site may block scrapers, "
                    "require a login, or the URL may be unreachable."
                ),
            }

        text = trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
            favor_recall=True,
        )

        if not text or len(text.strip()) < 20:
            return {
                **empty,
                "error": (
                    "No readable article text found at this URL. "
                    "The page may be behind a paywall, require login, or not contain a text article."
                ),
            }

        metadata  = trafilatura.extract_metadata(downloaded)
        title     = (metadata.title    or "") if metadata else ""
        site_name = (metadata.sitename or "") if metadata else ""

        # Trim to the max length the /analyse endpoint accepts
        if len(text) > MAX_TEXT_LENGTH:
            text = text[:MAX_TEXT_LENGTH]

        return {
            "text":       text,
            "title":      title,
            "site_name":  site_name,
            "error":      None,
            "char_count": len(text),
            "word_count": len(text.split()),
        }

    except Exception as e:
        return {**empty, "error": f"Scraping failed: {str(e)}"}
