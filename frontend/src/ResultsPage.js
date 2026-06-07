// ============================================================
// RESULTS PAGE
// File: src/ResultsPage.js
// ============================================================

import React, { useState } from "react";
import "./App.css";
import { API_URL } from "./config";

// ── LIME text highlighting ────────────────────────────────────
function buildTokens(text, limeData) {
  const limeMap = new Map();
  for (const item of limeData) {
    limeMap.set(item.word.toLowerCase(), item);
  }
  const tokens = [];
  const re = /([A-Za-z0-9']+|[^A-Za-z0-9']+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tok = m[1];
    const key = tok.toLowerCase().replace(/[^a-z0-9]/g, "");
    tokens.push({ text: tok, lime: limeMap.get(key) || null });
  }
  return tokens;
}

function HighlightedText({ text, limeData, limeRequested }) {
  if (!limeData?.length) {
    const note = limeRequested
      ? "(Highlighting unavailable — model not loaded)"
      : "(Word analysis not requested — enable LIME on the input page and re-analyse)";
    return (
      <div className="hl-text-box">
        <span style={{ color: "#888", fontSize: 12 }}>{note}</span>
        {" "}{text}
      </div>
    );
  }
  const tokens = buildTokens(text, limeData);
  return (
    <div className="hl-text-box">
      {tokens.map((tok, i) => {
        if (!tok.lime) return <span key={i}>{tok.text}</span>;
        const { direction, strength } = tok.lime;
        const alpha = Math.round((0.18 + strength * 0.52) * 100) / 100;
        const bg    = direction === "misleading"
          ? `rgba(231,76,60,${alpha})`
          : `rgba(39,174,96,${alpha})`;
        const color = direction === "misleading" ? "#7b1010" : "#0d4a22";
        return (
          <mark key={i} className="hl-word" style={{ background: bg, color }}
            title={`${direction} influence · ${(strength * 100).toFixed(0)}%`}>
            {tok.text}
          </mark>
        );
      })}
    </div>
  );
}

// ── Chunked text display ──────────────────────────────────────
function ChunkedText({ chunks }) {
  return (
    <div className="chunked-text">
      {chunks.map((chunk, i) => {
        const bad = chunk.verdict === "Misleading";
        return (
          <div key={i} className={`chunk-block ${bad ? "chunk-misleading" : "chunk-reliable"}`}>
            <div className="chunk-header">
              <span className="chunk-num">Paragraph {i + 1}</span>
              <span className={`chunk-badge ${bad ? "chunk-badge-m" : "chunk-badge-r"}`}>
                {bad ? "✗" : "✓"} {chunk.verdict} · {(chunk.misleading_prob * 100).toFixed(1)}% misleading
              </span>
            </div>
            <p className="chunk-text">{chunk.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 48, c = 2 * Math.PI * r;
  const color = score >= 70 ? "#27ae60" : score >= 40 ? "#f39c12" : "#e74c3c";
  return (
    <div className="score-ring-wrap">
      <svg width="114" height="114" viewBox="0 0 114 114">
        <circle cx="57" cy="57" r={r} fill="none" stroke="#e8e8e8" strokeWidth="9" />
        <circle cx="57" cy="57" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={c} strokeDashoffset={c - (score / 100) * c}
          strokeLinecap="round" transform="rotate(-90 57 57)" />
        <text x="57" y="54" textAnchor="middle" fontSize="20" fontWeight="bold" fill={color}>{score}</text>
        <text x="57" y="70" textAnchor="middle" fontSize="10" fill="#aaa">/100</text>
      </svg>
      <div className="score-ring-label">Credibility</div>
    </div>
  );
}

function ConfBar({ label, value, color }) {
  return (
    <div className="conf-bar-wrap">
      <div className="conf-bar-header">
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="conf-bar-track">
        <div className="conf-bar-fill" style={{ background: color, width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function FCBadge({ verdict }) {
  const map = {
    "TRUE":           ["fc-true",        "✓"],
    "FALSE":          ["fc-false",        "✗"],
    "PARTIALLY TRUE": ["fc-partial",      "~"],
    "UNVERIFIABLE":   ["fc-unverifiable", "?"],
  };
  const [cls, icon] = map[verdict] || map["UNVERIFIABLE"];
  return <span className={`fc-badge ${cls}`}>{icon} {verdict}</span>;
}

function VerdictBanner({ verdict }) {
  const map = {
    "Reliable":           ["verdict-reliable",    "✓"],
    "Misleading":         ["verdict-misleading",  "✗"],
    "Partially Reliable": ["verdict-partial",     "~"],
  };
  const [cls, icon] = map[verdict] || ["verdict-partial", "~"];
  return (
    <div className={`verdict-banner ${cls}`}>
      <span className="verdict-icon">{icon}</span>
      <span>FINAL VERDICT: {verdict.toUpperCase()}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ResultsPage({ result, submittedText, limeRequested = true, onBack, onClear }) {
  const [displayFc,        setDisplayFc]        = useState(result.fact_check);
  const [finalVerdict,     setFinalVerdict]     = useState(result.final_verdict);
  const [finalExplanation, setFinalExplanation] = useState(result.final_explanation);
  const [aiLoading,        setAiLoading]        = useState(false);
  const [aiError,          setAiError]          = useState("");
  const [showLimeChart,    setShowLimeChart]    = useState(false);
  const [showChunked,      setShowChunked]      = useState(result.chunks?.length > 0);

  const handleAiCheck = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`${API_URL}/fact-check-ai`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          text:             submittedText,
          style_verdict:    result.style_verdict,
          style_confidence: result.confidence,
        }),
      });
      if (!res.ok) {
        let msg = `Server error ${res.status}`;
        try { const body = await res.json(); msg = body.detail || msg; } catch {}
        setAiError(msg);
        return;
      }
      const data = await res.json();
      setDisplayFc(data.fact_check);
      setFinalVerdict(data.final_verdict);
      setFinalExplanation(data.final_explanation);
    } catch {
      setAiError("Could not reach the backend. Make sure the server is running on port 8000.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="results-card">

        {/* Header */}
        <div className="results-header">
          <div>
            <h2>Credibility Analysis Report</h2>
            {result.source_name && result.source_name !== "Unknown Source" && (
              <div className="results-source">Source: <strong>{result.source_name}</strong></div>
            )}
          </div>
          <div className="results-actions">
            <button className="btn-back" onClick={onBack}>← Analyse Another</button>
            <button className="btn-secondary btn-sm" onClick={onClear}>Clear</button>
          </div>
        </div>

        {/* Verdict */}
        <VerdictBanner verdict={finalVerdict} />
        <div className="explanation-box">{finalExplanation}</div>

        {/* ── Two panels ── */}
        <div className="two-col">

          {/* NLP panel */}
          <div className="nlp-panel">
            <div className="panel-title panel-title-nlp">NLP Style Analysis</div>
            <div className="nlp-top">
              <ScoreRing score={result.credibility_score} />
              <div className="nlp-bars">
                <ConfBar label="Reliable"   value={result.reliable_prob}   color="#27ae60" />
                <ConfBar label="Misleading" value={result.misleading_prob} color="#e74c3c" />
                <div className="mode-row">
                  <span className="mode-tag">{result.mode}</span>
                  <span className="conf-note">{(result.confidence * 100).toFixed(1)}% confidence</span>
                </div>
              </div>
            </div>
            {result.key_features?.length > 0 && (
              <div className="feature-section">
                <div className="feature-title">Detected Patterns</div>
                {result.key_features.map((f, i) => (
                  <span key={i} className={`feature-badge ${f.type === "warning" ? "feature-warning" : "feature-credible"}`}>
                    {f.type === "warning" ? "⚠ " : "✓ "}{f.word}
                  </span>
                ))}
              </div>
            )}
            <div className="panel-detail">{result.style_explanation}</div>
          </div>

          {/* Fact-check panel */}
          <div className="gemini-panel">
            <div className="panel-title panel-title-gemini">Fact-Check</div>

            {displayFc.fact_check_source === "not_found" ? (
              <div className="fc-not-found">
                <div className="fc-no-record-msg">
                  🔍 No human fact-check records found for this claim.
                </div>
                {displayFc.claim_extracted && (
                  <div className="fc-searched-claim">
                    Searched: "<em>{displayFc.claim_extracted}</em>"
                  </div>
                )}
                <div className="fc-ai-disclaimer">
                  <strong>⚠ Disclaimer:</strong> AI analysis is indicative only and may not be accurate.
                  It is not a substitute for professional fact-checking or independent verification.
                </div>
                <button className="btn-ai-check" onClick={handleAiCheck} disabled={aiLoading}>
                  {aiLoading
                    ? <><span className="hourglass-spin">⏳</span> Asking Gemini...</>
                    : "✨ Check with AI (Gemini)"}
                </button>
                {aiError && <div className="modal-error" style={{ marginTop: 10 }}>⚠ {aiError}</div>}
              </div>
            ) : displayFc.fact_check_source === "error" ? (
              <div className="fc-not-found">
                <div className="fc-error-msg">⚠ AI fact-check failed.</div>
                <div className="fc-error-detail">{displayFc.summary}</div>
                <button className="btn-ai-check" onClick={handleAiCheck} disabled={aiLoading}>
                  {aiLoading
                    ? <><span className="hourglass-spin">⏳</span> Retrying...</>
                    : "↺ Retry AI Check"}
                </button>
                {aiError && <div className="modal-error" style={{ marginTop: 10 }}>⚠ {aiError}</div>}
              </div>
            ) : (
              <>
                {displayFc.fact_check_source === "gemini_llm" && (
                  <div className="fc-ai-result-note">
                    ⚠ AI-generated analysis — not human-reviewed. Treat as indicative only.
                  </div>
                )}
                <div className="fc-header-row">
                  {displayFc.fact_check_source === "google_fact_check_api"
                    ? <span className="fc-source-badge fc-source-human">✓ Human-Reviewed</span>
                    : <span className="fc-source-badge fc-source-ai">⚡ AI Inference</span>
                  }
                  <FCBadge verdict={displayFc.verdict} />
                </div>
                {displayFc.claim_extracted && (
                  <div className="claim-box">
                    <strong>Claim checked:</strong> {displayFc.claim_extracted}
                  </div>
                )}
                <div className="panel-detail">{displayFc.summary}</div>
                {displayFc.sources?.length > 0 && (
                  <div className="sources-row">
                    <div className="sources-label">
                      {displayFc.fact_check_source === "google_fact_check_api" ? "Verified sources:" : "Sources consulted:"}
                    </div>
                    {displayFc.sources.map((s, i) => {
                      const isUrl = s.includes("http");
                      const [label, url] = isUrl ? s.split(" — ") : [s, null];
                      return url
                        ? <a key={i} className="source-tag source-link" href={url} target="_blank" rel="noreferrer">{label}</a>
                        : <span key={i} className="source-tag">{s}</span>;
                    })}
                  </div>
                )}
                <div className="panel-detail" style={{ marginTop: 8 }}>{displayFc.explanation}</div>
              </>
            )}
          </div>
        </div>

        {/* ── Analysis view (toggled) ── */}
        {submittedText && (
          <div className="lime-section">

            {/* Header — title changes with view; toggle button appears when chunks exist */}
            <div className="lime-section-header">
              <div className="section-title" style={{ margin: 0 }}>
                {showChunked && result.chunks?.length > 0
                  ? "Paragraph-by-Paragraph Analysis"
                  : "Word Influence — LIME Explainability"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {(!showChunked || !result.chunks?.length) && result.lime_explanation?.length > 0 && (
                  <div className="hl-legend">
                    <span className="hl-legend-dot hl-dot-red" /> Misleading
                    <span className="hl-legend-dot hl-dot-green" style={{ marginLeft: 12 }} /> Reliable
                  </div>
                )}
                {result.chunks?.length > 0 && (
                  <button className="btn-view-toggle" onClick={() => setShowChunked(v => !v)}>
                    {showChunked ? "Word Influence" : "Paragraph Analysis"}
                  </button>
                )}
              </div>
            </div>

            {/* Body — swaps based on toggle */}
            {showChunked && result.chunks?.length > 0 ? (
              <>
                <p className="lime-desc">
                  Each paragraph was scored independently. The overall verdict above is the average across all paragraphs.
                </p>
                <ChunkedText chunks={result.chunks} />
              </>
            ) : (
              <>
                <p className="lime-desc">
                  {result.lime_explanation?.length > 0
                    ? "Words are highlighted based on their influence on the verdict. Hover a word for its influence strength."
                    : limeRequested
                      ? "Word highlighting is only available when the DistilBERT model is loaded."
                      : "Word analysis was not requested. Enable \"Include word influence analysis\" on the input page and re-analyse."}
                </p>
                <HighlightedText text={submittedText} limeData={result.lime_explanation} limeRequested={limeRequested} />
                {result.lime_explanation?.length > 0 && (
                  <>
                    <button className="btn-lime-toggle" onClick={() => setShowLimeChart(v => !v)}>
                      {showLimeChart ? "▲ Hide Top Influencing Words" : "▼ Show Top Influencing Words"}
                    </button>
                    {showLimeChart && (
                      <div className="lime-chart">
                        {result.lime_explanation.map((item, i) => (
                          <div key={i} className="lime-row">
                            <span className="lime-word">{item.word}</span>
                            <div className="lime-track">
                              <div
                                className={`lime-bar ${item.direction === "misleading" ? "lime-bar-red" : "lime-bar-green"}`}
                                style={{ width: `${Math.round(item.strength * 100)}%` }}
                              />
                            </div>
                            <span className={`lime-pct ${item.direction === "misleading" ? "lime-tag-red" : "lime-tag-green"}`}>
                              {Math.round(item.strength * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="meta-footer">
          Processed in {result.processing_time}s &nbsp;·&nbsp;
          DistilBERT NLP +&nbsp;
          {displayFc.fact_check_source === "google_fact_check_api" ? "Google Fact Check API" :
           displayFc.fact_check_source === "gemini_llm"            ? "Gemini AI (user opt-in)" :
           displayFc.fact_check_source === "error"                 ? "Gemini AI (failed)" :
           "Google Fact Check API (no match)"}
          &nbsp;·&nbsp;Always verify with independent sources
        </div>

      </div>
    </div>
  );
}
