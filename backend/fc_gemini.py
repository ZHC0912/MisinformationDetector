"""
=============================================================
GEMINI LLM FACT-CHECK FALLBACK
File: backend/fc_gemini.py

Uses the Gemini 2.5 Flash model to assess factual accuracy
when no indexed human fact-check is found via the Google
Fact Check Tools API.

Note: This is an AI inference, not a verified fact-check.
Results should be treated as indicative, not authoritative.
=============================================================
"""

import json
import time
import requests
from config import (
    GEMINI_API_KEY, GEMINI_FC_MODEL, GEMINI_BASE_URL, MAX_RETRIES, RETRY_DELAY,
    GEMINI_TEMPERATURE, GEMINI_MAX_TOKENS,
)

GEMINI_URL = f"{GEMINI_BASE_URL}/{GEMINI_FC_MODEL}:generateContent?key={GEMINI_API_KEY}"

# ── Friendly error messages ─────────────────────────────────────
_FRIENDLY_MESSAGES = {
    "overload":    "Sorry! Please try again later. The fact-checking service is currently overloaded.",
    "quota":       "Sorry! Please try again later. The fact-checking service has reached its daily limit.",
    "timeout":     "Sorry! Please try again later. The fact-checking service took too long to respond.",
    "connection":  "Sorry! Please try again later. Could not reach the fact-checking service.",
    "parse":       "Sorry! Please try again later. The fact-checking service returned an unexpected response.",
    "unavailable": "Sorry! Please try again later. The fact-checking service is temporarily unavailable.",
}

_PROMPT_TEMPLATE = """You are a professional fact-checker. Analyse the following article or claim and verify its factual accuracy.

Article/Claim:
\"\"\"{text}\"\"\"

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{{
  "verdict": "TRUE",
  "confidence": 0.85,
  "summary": "one sentence summary of your finding",
  "explanation": "2-3 sentences explaining what is true or false and why",
  "sources": ["source 1 name", "source 2 name"],
  "claim_extracted": "the main factual claim you checked"
}}

Rules:
- verdict must be exactly one of: TRUE, FALSE, PARTIALLY TRUE, UNVERIFIABLE
- confidence must be a number between 0.0 and 1.0
- Do not include any text outside the JSON object
- If you cannot verify the claim, use UNVERIFIABLE"""


# ── Main function ───────────────────────────────────────────────

def fact_check_gemini(text: str) -> dict:
    """
    Use Gemini 2.5 Flash to assess the factual accuracy of the given text.
    Retries up to MAX_RETRIES times on transient failures.
    Always returns a dict — never raises.
    """
    payload = {
        "contents": [{"parts": [{"text": _PROMPT_TEMPLATE.format(text=text)}]}],
        "generationConfig": {
            "temperature":     GEMINI_TEMPERATURE,
            "maxOutputTokens": GEMINI_MAX_TOKENS,
        },
    }

    last_error = "unavailable"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"  [Gemini] Attempt {attempt}/{MAX_RETRIES}...")

            response = requests.post(
                GEMINI_URL,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )

            if response.status_code == 503:
                last_error = "overload"
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                continue

            if response.status_code == 429:
                last_error = "quota"
                break   # no point retrying a quota error

            if response.status_code != 200:
                last_error = "unavailable"
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                continue

            candidates = response.json().get("candidates", [])
            if not candidates:
                last_error = "unavailable"
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                continue

            raw_text = candidates[0]["content"]["parts"][0]["text"].strip()

            # Strip markdown code fences if Gemini wraps its response
            if "```" in raw_text:
                for part in raw_text.split("```"):
                    part = part.strip()
                    # Drop optional language label line (e.g. "json", "python", "JSON")
                    if part and not part.startswith("{"):
                        newline = part.find("\n")
                        if newline != -1:
                            part = part[newline:].strip()
                    if part.startswith("{"):
                        raw_text = part
                        break

            result = json.loads(raw_text.strip())
            print(f"  [Gemini] Succeeded on attempt {attempt}.")

            return {
                "verdict":           str(result.get("verdict", "UNVERIFIABLE")).upper(),
                "confidence":        float(result.get("confidence", 0.5)),
                "summary":           str(result.get("summary", "")),
                "explanation":       str(result.get("explanation", "")),
                "sources":           list(result.get("sources", [])),
                "claim_extracted":   str(result.get("claim_extracted", text[:100])),
                "error":             None,
                "fact_check_source": "gemini_llm",
            }

        except json.JSONDecodeError:
            last_error = "parse"
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)

        except requests.exceptions.Timeout:
            last_error = "timeout"
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)

        except requests.exceptions.ConnectionError:
            last_error = "connection"
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)

        except Exception:
            last_error = "unavailable"
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)

    print(f"  [Gemini] All {MAX_RETRIES} attempts failed. Code: {last_error}")
    return _error_result(last_error)


def _error_result(code: str) -> dict:
    msg = _FRIENDLY_MESSAGES.get(code, "Sorry! Please try again later. Model overload or service unavailable.")
    return {
        "verdict":           "UNVERIFIABLE",
        "confidence":        0.0,
        "summary":           msg,
        "explanation":       msg,
        "sources":           [],
        "claim_extracted":   "",
        "error":             msg,
        "fact_check_source": "error",
    }
