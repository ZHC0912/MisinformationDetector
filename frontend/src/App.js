// ============================================================
// INPUT PAGE
// File: src/App.js
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";
import ResultsPage from "./ResultsPage";
import EvaluationPage from "./EvaluationPage";
import ErrorBoundary from "./ErrorBoundary";
import SkeletonResults from "./SkeletonResults";
import { API_URL } from "./config";

function Hourglass() {
  return <span className="hourglass-spin">⏳</span>;
}

// ── URL Modal ─────────────────────────────────────────────────
function UrlModal({ onClose, onSuccess }) {
  const [urlInput,  setUrlInput]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const handleFetch = async () => {
    if (!urlInput.trim()) { setError("Please enter a URL."); return; }
    if (!/^https?:\/\/.+/i.test(urlInput.trim())) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    setError(""); setLoading(true);
    try {
      const res  = await axios.post(`${API_URL}/scrape-url`,
        { url: urlInput.trim() },
        { validateStatus: () => true });
      const data = res.data;
      if (res.status >= 400) { setError(data.detail || "Scraping failed."); return; }
      if (data.error) { setError(data.error); return; }
      if (data.text)  {
        onSuccess({
          text:      data.text,
          siteName:  data.site_name || "",
          wordCount: data.word_count,
          label:     data.title || data.site_name || "article",
        });
      }
    } catch {
      setError("Cannot connect to backend. Make sure the server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-title">Fetch Article from URL</div>
      <p className="modal-desc">Paste a news article link to automatically extract the text.</p>
      <input
        className="modal-input"
        type="url"
        placeholder="https://www.bbc.com/news/..."
        value={urlInput}
        onChange={e => setUrlInput(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleFetch()}
        autoFocus
      />
      {error && <div className="modal-error">⚠ {error}</div>}
      <div className="modal-actions">
        <button className="btn-primary modal-btn-primary" onClick={handleFetch} disabled={loading}>
          {loading ? <><Hourglass /> Fetching...</> : "🔗 Fetch Article"}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

// ── OCR Modal ─────────────────────────────────────────────────
function OcrModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const fileRef = useRef(null);

  const processFile = useCallback(async (file) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setError("Unsupported format. Please use JPG, PNG, WEBP, or GIF.");
      return;
    }
    setError(""); setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await axios.post(`${API_URL}/extract-text`, form, { validateStatus: () => true });
      const data = res.data;
      if (res.status >= 400) { setError(data.detail || "OCR failed."); return; }
      if (data.error) { setError(data.error); return; }
      if (data.extracted_text) {
        onSuccess({ text: data.extracted_text, wordCount: data.word_count });
      }
    } catch {
      setError("Cannot connect to backend. Make sure the server is running on port 8000.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [onSuccess]);

  // Ctrl+V paste support
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) processFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [processFile]);

  return (
    <>
      <div className="modal-title">Extract Text from Image</div>
      <p className="modal-desc">Upload a screenshot or photo of an article to extract its text.</p>

      <div className="ocr-drop-area" onClick={() => !loading && fileRef.current.click()}>
        {loading
          ? <span className="ocr-drop-loading"><Hourglass /> Extracting text...</span>
          : <>
              <div className="ocr-drop-icon">📷</div>
              <div className="ocr-drop-label">Click to upload image</div>
              <div className="ocr-drop-hint">or press <kbd>Ctrl+V</kbd> to paste from clipboard</div>
              <div className="ocr-drop-formats">JPG · PNG · WEBP · GIF · max 10 MB</div>
            </>
        }
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />

      {error && <div className="modal-error">⚠ {error}</div>}

      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [text,        setText]        = useState("");
  const [sourceName,  setSourceName]  = useState("");
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [successMsg,  setSuccessMsg]  = useState("");
  const [modal,       setModal]       = useState(null); // null | "url" | "ocr"
  const [showResults, setShowResults] = useState(false);
  const [showEval,    setShowEval]    = useState(false);
  const [runLime,     setRunLime]     = useState(false);
  const [runShap,     setRunShap]     = useState(true);   // SHAP on by default

  // Close modal on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setModal(null); };
    if (modal) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal]);

  const handleUrlSuccess = ({ text: t, siteName, wordCount, label }) => {
    setText(t);
    if (siteName && !sourceName) setSourceName(siteName);
    setSuccessMsg(`✓ Extracted ${wordCount} words from "${label}"`);
    setModal(null);
  };

  const handleOcrSuccess = ({ text: t, wordCount }) => {
    setText(t);
    setSuccessMsg(`✓ Extracted ${wordCount} words from image`);
    setModal(null);
  };

  const handleAnalyse = async () => {
    if (text.trim().length < 20) { setError("Please enter at least 20 characters."); return; }
    setError(""); setSuccessMsg(""); setLoading(true); setResult(null);
    try {
      const res = await axios.post(`${API_URL}/analyse`,
        { text: text.trim(), source_name: sourceName.trim() || "Unknown Source", run_lime: runLime, run_shap: runShap },
        { validateStatus: () => true });
      if (res.status >= 400) throw new Error("Server error: " + res.status);
      setResult(res.data);
      setShowResults(true);
    } catch (err) {
      setError("Cannot connect to backend on port 8000. Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setText(""); setSourceName(""); setResult(null);
    setShowResults(false); setError(""); setSuccessMsg("");
  };

  // ── Evaluation page ────────────────────────────────────────
  if (showEval) {
    return <EvaluationPage onBack={() => setShowEval(false)} />;
  }

  // ── Loading skeleton (during analysis) ─────────────────────
  if (loading && !showResults) {
    return <SkeletonResults />;
  }

  // ── Results page ───────────────────────────────────────────
  if (showResults && result) {
    return (
      <ErrorBoundary onReset={() => setShowResults(false)}>
        <ResultsPage result={result} submittedText={text} limeRequested={runLime} shapRequested={runShap}
          onBack={() => setShowResults(false)} onClear={handleClear} />
      </ErrorBoundary>
    );
  }

  // ── Input page ─────────────────────────────────────────────
  return (
    <div className="page">
      <div className="card">

        <div className="header">
          <h1>Misinformation Detector</h1>
          <p>AI-based credibility assessment using DistilBERT NLP and Gemini Fact-Check</p>
          <div className="header-badges">
            <span className="badge badge-nlp">DistilBERT NLP</span>
            <span className="badge badge-gemini">Gemini Fact-Check</span>
            <span className="badge badge-ocr">Image OCR</span>
            <span className="badge badge-url">URL Scraper</span>
          </div>
          <button className="btn-eval-link" onClick={() => setShowEval(true)}>
            📈 Model Evaluation
          </button>
        </div>

        <label className="form-label">Source Name <span className="label-optional">(optional)</span></label>
        <input className="form-input"
          placeholder="e.g. BBC News, @politician, Ministry of Health"
          value={sourceName} onChange={e => setSourceName(e.target.value)} />

        <label className="form-label">Article / Post Text</label>
        <textarea className="form-textarea"
          placeholder="Paste article or post text here..."
          value={text}
          onChange={e => { setText(e.target.value); setSuccessMsg(""); }} />

        {successMsg && <div className="success-msg">{successMsg}</div>}
        {error      && <div className="error-box">⚠ {error}</div>}

        <div className="input-tools-row">
          <button className="btn-tool" onClick={() => setModal("url")}>
            🔗 Fetch Article
          </button>
          <button className="btn-tool" onClick={() => setModal("ocr")}>
            📷 Extract from Image
          </button>
        </div>

        <label className="lime-toggle-row">
          <input
            type="checkbox"
            checked={runLime}
            onChange={e => setRunLime(e.target.checked)}
          />
          <span>Include word influence analysis (LIME) <span className="label-optional">— adds ~5–10s</span></span>
        </label>

        <label className="lime-toggle-row">
          <input
            type="checkbox"
            checked={runShap}
            onChange={e => setRunShap(e.target.checked)}
          />
          <span>Include word influence analysis (SHAP) <span className="label-optional">— adds ~10–45s</span></span>
        </label>

        <div className="btn-row">
          <button className="btn-primary" onClick={handleAnalyse} disabled={loading}>
            {loading ? <><Hourglass /> Analysing...</> : "🔍 Analyse Credibility"}
          </button>
          <button className="btn-secondary" onClick={handleClear}>Clear</button>
        </div>

      </div>

      {/* Modal overlay */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            {modal === "url"
              ? <UrlModal onClose={() => setModal(null)} onSuccess={handleUrlSuccess} />
              : <OcrModal onClose={() => setModal(null)} onSuccess={handleOcrSuccess} />
            }
          </div>
        </div>
      )}
    </div>
  );
}
