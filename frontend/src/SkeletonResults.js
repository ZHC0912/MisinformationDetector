// ============================================================
// SKELETON RESULTS
// File: src/SkeletonResults.js
// Shimmer placeholder shown while an analysis is running, so the
// wait feels faster than a single spinning hourglass.
// ============================================================

import React from "react";
import "./App.css";

export default function SkeletonResults() {
  return (
    <div className="page">
      <div className="results-card" aria-busy="true" aria-label="Analysing content">

        {/* Header */}
        <div className="results-header">
          <div style={{ flex: 1 }}>
            <div className="skel skel-title" />
            <div className="skel skel-line" style={{ width: "35%" }} />
          </div>
        </div>

        {/* Verdict + score ring + confidence bars */}
        <div className="skel-verdict-row">
          <div className="skel skel-ring" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="skel skel-line" style={{ width: "70%" }} />
            <div className="skel skel-bar" />
            <div className="skel skel-bar" style={{ width: "85%" }} />
          </div>
        </div>

        {/* Explanation / fact-check / word-influence blocks */}
        <div className="skel skel-block" />
        <div className="skel skel-block" />

        <div className="skel-note">
          <span className="hourglass-spin">⏳</span> Analysing content — running DistilBERT and fact-checking…
        </div>
      </div>
    </div>
  );
}
