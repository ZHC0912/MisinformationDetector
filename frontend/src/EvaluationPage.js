// ============================================================
// EVALUATION PAGE
// File: src/EvaluationPage.js
// Displays model evaluation metrics, confusion matrix, and ROC curve.
// ============================================================

import React, { useState } from "react";
import "./App.css";
import { API_URL } from "./config";

// ── Metric card ───────────────────────────────────────────────
function MetricCard({ label, value, color, subtitle }) {
  return (
    <div className="eval-metric-card" style={{ borderTop: `4px solid ${color}` }}>
      <div className="eval-metric-value" style={{ color }}>{(value * 100).toFixed(1)}%</div>
      <div className="eval-metric-label">{label}</div>
      {subtitle && <div className="eval-metric-sub">{subtitle}</div>}
    </div>
  );
}

// ── Confusion matrix ──────────────────────────────────────────
function ConfusionMatrix({ cm }) {
  const total = cm.tp + cm.tn + cm.fp + cm.fn;
  return (
    <div className="eval-cm-wrap">
      <div className="eval-cm-title">Confusion Matrix</div>
      <div className="eval-cm-axis-label eval-cm-axis-x">Predicted Label</div>
      <div className="eval-cm-grid-wrap">
        <div className="eval-cm-axis-label eval-cm-axis-y">Actual Label</div>
        <div>
          {/* Header row */}
          <div className="eval-cm-header-row">
            <div className="eval-cm-corner" />
            <div className="eval-cm-col-head">Reliable</div>
            <div className="eval-cm-col-head">Misleading</div>
          </div>
          {/* Actual Reliable row */}
          <div className="eval-cm-row">
            <div className="eval-cm-row-head">Reliable</div>
            <div className="eval-cm-cell eval-cm-tn">
              <div className="eval-cm-count">{cm.tn}</div>
              <div className="eval-cm-pct">{((cm.tn / total) * 100).toFixed(0)}%</div>
              <div className="eval-cm-cell-label">True Neg.</div>
            </div>
            <div className="eval-cm-cell eval-cm-fp">
              <div className="eval-cm-count">{cm.fp}</div>
              <div className="eval-cm-pct">{((cm.fp / total) * 100).toFixed(0)}%</div>
              <div className="eval-cm-cell-label">False Pos.</div>
            </div>
          </div>
          {/* Actual Misleading row */}
          <div className="eval-cm-row">
            <div className="eval-cm-row-head">Misleading</div>
            <div className="eval-cm-cell eval-cm-fn">
              <div className="eval-cm-count">{cm.fn}</div>
              <div className="eval-cm-pct">{((cm.fn / total) * 100).toFixed(0)}%</div>
              <div className="eval-cm-cell-label">False Neg.</div>
            </div>
            <div className="eval-cm-cell eval-cm-tp">
              <div className="eval-cm-count">{cm.tp}</div>
              <div className="eval-cm-pct">{((cm.tp / total) * 100).toFixed(0)}%</div>
              <div className="eval-cm-cell-label">True Pos.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-class classification report ───────────────────────────
function ClassReport({ perClass }) {
  const rows = [
    { name: "Reliable",   cls: perClass.reliable,   color: "#27ae60" },
    { name: "Misleading", cls: perClass.misleading,  color: "#e74c3c" },
  ];
  return (
    <div className="eval-report-wrap">
      <div className="eval-cm-title">Classification Report</div>
      <table className="eval-report-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1</th>
            <th>Support</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, cls, color }) => (
            <tr key={name}>
              <td><span className="eval-class-dot" style={{ background: color }} />{name}</td>
              <td>{(cls.precision * 100).toFixed(1)}%</td>
              <td>{(cls.recall    * 100).toFixed(1)}%</td>
              <td><strong>{(cls.f1 * 100).toFixed(1)}%</strong></td>
              <td>{cls.support}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="eval-report-note">
        Precision = of all predicted positive, how many were correct.<br />
        Recall = of all actual positive, how many we caught.<br />
        F1 = harmonic mean of precision and recall.
      </div>
    </div>
  );
}

// ── ROC Curve (SVG) ───────────────────────────────────────────
function RocCurve({ points, auc }) {
  const W = 320, H = 260, PAD = 40;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  // points ordered by threshold descending = FPR low→high
  const sorted = [...points].sort((a, b) => a.fpr - b.fpr);

  const toX = (fpr) => PAD + fpr * innerW;
  const toY = (tpr) => PAD + (1 - tpr) * innerH;

  const pathD = sorted.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${toX(p.fpr).toFixed(1)} ${toY(p.tpr).toFixed(1)}`
  ).join(" ");

  // Axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className="eval-roc-wrap">
      <div className="eval-cm-title">ROC Curve — AUC = {auc.toFixed(3)}</div>
      <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>
        {/* Grid lines */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={toX(t)} y1={PAD} x2={toX(t)} y2={PAD + innerH}
              stroke="#eee" strokeWidth="1" />
            <line x1={PAD} y1={toY(t)} x2={PAD + innerW} y2={toY(t)}
              stroke="#eee" strokeWidth="1" />
          </g>
        ))}

        {/* Diagonal reference (random classifier) */}
        <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)}
          stroke="#ccc" strokeWidth="1.5" strokeDasharray="6 4" />

        {/* ROC curve */}
        <path d={pathD} fill="none" stroke="#6c3fc8" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Axes */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + innerH} stroke="#999" strokeWidth="1.5" />
        <line x1={PAD} y1={PAD + innerH} x2={PAD + innerW} y2={PAD + innerH} stroke="#999" strokeWidth="1.5" />

        {/* X ticks + labels */}
        {ticks.map(t => (
          <g key={`x${t}`}>
            <line x1={toX(t)} y1={PAD + innerH} x2={toX(t)} y2={PAD + innerH + 4}
              stroke="#999" strokeWidth="1" />
            <text x={toX(t)} y={PAD + innerH + 16} textAnchor="middle"
              fontSize="10" fill="#888">{t.toFixed(2)}</text>
          </g>
        ))}

        {/* Y ticks + labels */}
        {ticks.map(t => (
          <g key={`y${t}`}>
            <line x1={PAD - 4} y1={toY(t)} x2={PAD} y2={toY(t)}
              stroke="#999" strokeWidth="1" />
            <text x={PAD - 7} y={toY(t) + 4} textAnchor="end"
              fontSize="10" fill="#888">{t.toFixed(2)}</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={PAD + innerW / 2} y={H - 2} textAnchor="middle" fontSize="11" fill="#666">
          False Positive Rate
        </text>
        <text x={12} y={PAD + innerH / 2} textAnchor="middle" fontSize="11" fill="#666"
          transform={`rotate(-90 12 ${PAD + innerH / 2})`}>
          True Positive Rate
        </text>

        {/* AUC annotation */}
        <rect x={PAD + innerW - 90} y={PAD + 6} width={86} height={22} rx="4"
          fill="white" stroke="#ddd" />
        <text x={PAD + innerW - 47} y={PAD + 21} textAnchor="middle" fontSize="11" fill="#6c3fc8" fontWeight="bold">
          AUC = {auc.toFixed(3)}
        </text>
      </svg>
      <p className="eval-roc-note">
        The ROC curve shows the trade-off between True Positive Rate (sensitivity) and
        False Positive Rate at every decision threshold. AUC = 1.0 is a perfect classifier;
        AUC = 0.5 is random. The dashed line represents a random baseline.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function EvaluationPage({ onBack }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const runEval = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const res = await fetch(`${API_URL}/evaluate`);
      if (!res.ok) {
        let msg = `Server error ${res.status}`;
        try { const body = await res.json(); msg = body.detail || msg; } catch {}
        setError(msg);
        return;
      }
      setData(await res.json());
    } catch {
      setError("Cannot connect to backend on port 8000. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="results-card">

        {/* Header */}
        <div className="results-header">
          <h2>📈 Model Evaluation Dashboard</h2>
          <button className="btn-back" onClick={onBack}>← Back</button>
        </div>

        <p className="eval-intro">
          Evaluates the DistilBERT NLP classifier against the <strong>LIAR benchmark</strong> test
          split — <strong>896 fact-checked political statements</strong> (448 Reliable, 448 Misleading)
          from PolitiFact (Wang, 2017). Computes standard binary classification metrics.
        </p>

        {/* Run button */}
        {!data && (
          <div style={{ textAlign: "center", margin: "24px 0" }}>
            <button className="btn-primary" onClick={runEval} disabled={loading}>
              {loading ? "⏳ Running evaluation..." : "▶ Run Evaluation"}
            </button>
            {error && <div className="error-box" style={{ marginTop: 16 }}>⚠ {error}</div>}
          </div>
        )}

        {/* Results */}
        {data && (
          <>
            {/* Mode badge */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span className="mode-tag" style={{ fontSize: 13 }}>
                Model mode: {data.model_mode}
              </span>
              <span style={{ fontSize: 12, color: "#888", marginLeft: 10 }}>
                {data.total_samples} samples · threshold = {data.threshold}
              </span>
            </div>

            {/* Metric cards */}
            <div className="eval-metrics-row">
              <MetricCard label="Accuracy"      value={data.accuracy}        color="#2c3e50" subtitle="Overall correct" />
              <MetricCard label="Macro F1"      value={data.macro_f1}        color="#6c3fc8" subtitle="Harmonic mean" />
              <MetricCard label="Macro Prec."   value={data.macro_precision} color="#2980b9" subtitle="Avg. precision" />
              <MetricCard label="Macro Recall"  value={data.macro_recall}    color="#16a085" subtitle="Avg. recall" />
              <MetricCard label="AUC-ROC"       value={data.roc_auc}         color="#e67e22" subtitle="Area under curve" />
            </div>

            {/* Confusion matrix + report */}
            <div className="eval-lower-row">
              <ConfusionMatrix cm={data.confusion_matrix} />
              <ClassReport perClass={data.per_class} />
            </div>

            {/* ROC curve */}
            <RocCurve points={data.roc_curve} auc={data.roc_auc} />

            {/* Re-run button */}
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn-secondary" onClick={runEval} disabled={loading}>
                {loading ? "⏳ Running..." : "↻ Re-run"}
              </button>
            </div>
          </>
        )}

        {/* Methodology note */}
        <div className="eval-methodology">
          <strong>Methodology:</strong> The model is evaluated at a fixed 0.5 decision threshold
          using the LIAR benchmark test split (Wang, 2017) — 896 short political claims from PolitiFact,
          balanced at 448 per class. Label mapping: pants-fire / false / barely-true → Misleading;
          mostly-true / true → Reliable; half-true excluded as ambiguous. This is an
          <strong> out-of-domain</strong> evaluation: the model was trained on full news articles
          (ISOT dataset) and tested on short political claims, probing generalisation beyond
          the training distribution. Metrics are from the NLP classifier only.
        </div>

      </div>
    </div>
  );
}
