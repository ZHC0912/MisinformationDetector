// ============================================================
// SCROLL-DRIVEN DEMO  (dark — lives inside the landing page)
// Demonstrates what the NLP model does: as the user scrolls
// through this section, manipulation-language words highlight
// one-by-one and a credibility verdict fades in. Everything is
// tied to scroll POSITION (0→1 progress), so it reverses smoothly
// when scrolling up. No animation library — plain React state +
// CSS transitions.
//
// IMPORTANT: the score, verdict and detected patterns shown below are the
// REAL recorded output of the /analyse endpoint for this exact sentence
// (run 2026-08-19 against the deployed stage-2 model: credibility_score
// 0, style_verdict "Misleading", 99.8% confidence, 5 warning
// key_features). They are hard-coded here as a PRE-RECORDED sample —
// this component does NOT call the backend at runtime. Only the reveal
// (word highlighting, the score count-down) is animation.
//
// The result card mirrors the real ResultsPage.tsx treatment for this
// result: RED verdict (destructive), the same value-reflecting score ring
// (empty at 0), and the six detected patterns as destructive chips.
// ============================================================

import { useEffect, useRef, useState, type RefObject } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

// Palette (matches the landing's dark theme).
const INK = "#E7EBEF";
const BAD_BG = "rgba(229,72,77,.18)";
const BAD_BORDER = "rgba(229,72,77,.42)";
const BAD_INK = "#FF9DA0";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Tracks how far the viewport has scrolled THROUGH `ref`'s element,
 * as a 0→1 fraction. 0 = element top at viewport top; 1 = element
 * bottom reaching the viewport bottom. Updated via rAF on scroll,
 * so reading it is cheap and it tracks position in both directions.
 */
function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      setProgress(total > 0 ? clamp(scrolled / total) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
  return progress;
}

/** True when the user asks for reduced motion. Drives the static fallback. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

// The demo sentence, split into segments. `warn` marks a segment as a
// manipulation-language match; its number is the index into THRESHOLDS.
const SEGMENTS: { t: string; warn?: number }[] = [
  { t: "BREAKING", warn: 0 },
  { t: ": Leaked documents expose the " },
  { t: "shocking", warn: 1 },
  { t: " truth they're hiding. " },
  { t: "Share before it's deleted", warn: 2 },
  { t: "!" },
];

// Scroll fraction at which each highlighted span switches on — evenly
// staggered across the three warn segments (BREAKING, shocking, Share…).
const THRESHOLDS = [0.2, 0.4, 0.6];
const VERDICT_AT = 0.6; // result card starts fading in here

// Real recorded /analyse output for the sentence above (run 2026-08-19).
// credibility_score 0 · style_verdict "Misleading" · 99.8% confidence ·
// 5 warning key_features. TRUE_PATTERNS is the actual `key_features` list
// (same order the API returned it); the ResultsPage renders each as a
// destructive chip, so we do too.
const TRUE_SCORE = 0;
const TRUE_VERDICT = "Misleading";
const TRUE_CONFIDENCE = 0.9979; // response `confidence` (formatted like the sidebar)
const TRUE_PATTERNS = [
  "shocking",
  "breaking",
  "leaked",
  "deleted",
  "before it's deleted",
];

// Same tone mapping ResultsPage uses (scoreTone / ScoreRing): ≥70 green,
// ≥40 amber, else red. At the real score (0) the arc is red-toned but
// zero-length, so the ring reads as an empty faint track.
const ringTone = (s: number) =>
  s >= 70 ? "text-success" : s >= 40 ? "text-warning" : "text-destructive";

// Score ring copied from ResultsPage.tsx ScoreRing (onDark variant): faint
// white track + tone-coloured arc whose length reflects the value.
function DemoScoreRing({ score }: { score: number }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1"
      role="img"
      aria-label={`Credibility score ${score} out of 100`}
    >
      <svg className={ringTone(score)} width="96" height="96" viewBox="0 0 114 114">
        <circle
          className="text-white"
          cx="57"
          cy="57"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          opacity={0.18}
        />
        <circle
          cx="57"
          cy="57"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
          strokeLinecap="round"
          transform="rotate(-90 57 57)"
        />
        <text
          x="57"
          y="54"
          textAnchor="middle"
          className="fill-white"
          fontSize="26"
          fontWeight="700"
        >
          {score}
        </text>
        <text x="57" y="72" textAnchor="middle" className="fill-white/60" fontSize="12">
          /100
        </text>
      </svg>
      {/* Ring label — matches the "VERDICT"/"CONFIDENCE" eyebrow treatment
          (ResultsPage labels its score ring "Credibility" the same way). */}
      <div
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "rgba(231,235,239,.5)" }}
      >
        Credibility
      </div>
    </div>
  );
}

export default function ScrollDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const scrolled = useScrollProgress(sectionRef);
  const reduced = usePrefersReducedMotion();

  // Reduced motion → fully-revealed static view (no scrolling required).
  // Otherwise the reveal is driven by scroll position through the section.
  const progress = reduced ? 1 : scrolled;

  // Score counts down from 100 to the REAL recorded score (0) across the
  // scroll range, so the animation lands on the true model number.
  const score = Math.round(100 - clamp((progress - 0.15) / 0.6) * (100 - TRUE_SCORE));
  const verdictOn = progress >= VERDICT_AT;

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{
        // Tall spacer drives the pinned scroll play-through (150vh → ~50vh of
        // pinned scrolling, enough to reveal all highlights + the verdict
        // without excessive scrolling). Static when reduced motion is on.
        minHeight: reduced ? undefined : "150vh",
        borderTop: "1px solid rgba(255,255,255,.08)",
        borderBottom: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.02)",
      }}
    >
      {/* Sticky stage: stays centred while the tall section scrolls past it */}
      <div className="sticky top-0 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 text-center">
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: "rgba(231,235,239,.5)",
              }}
            >
              Recorded model output
            </span>
            <p className="mt-2 text-sm" style={{ color: "rgba(231,235,239,.6)" }}>
              A real model output for this sample sentence — the score and verdict
              are what the analyser actually returned, revealed as you scroll.
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(231,235,239,.4)" }}>
              Pre-recorded from an actual analyse run — not a live API call.
            </p>
          </div>

          {/* The sentence under analysis (dark glass card) */}
          <div
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,.13)",
              background:
                "linear-gradient(155deg,rgba(255,255,255,.09),rgba(255,255,255,.03))",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
              padding: "28px",
              boxShadow: "0 24px 60px rgba(6,7,10,.35)",
            }}
          >
            <p
              className="text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl"
              style={{ color: INK }}
            >
              {SEGMENTS.map((seg, i) => {
                if (seg.warn === undefined) return <span key={i}>{seg.t}</span>;
                const active = progress >= THRESHOLDS[seg.warn];
                return (
                  <span
                    key={i}
                    className="rounded px-1 [-webkit-box-decoration-break:clone] [box-decoration-break:clone] motion-reduce:transition-none"
                    style={{
                      transition: "background .5s, color .5s, border-color .5s",
                      background: active ? BAD_BG : "transparent",
                      border: `1px solid ${active ? BAD_BORDER : "transparent"}`,
                      color: active ? BAD_INK : INK,
                      fontWeight: active ? 600 : undefined,
                    }}
                  >
                    {seg.t}
                  </span>
                );
              })}
            </p>

            {/* Result card — fades/slides in as the verdict forms.
                Mirrors ResultsPage.tsx: value-reflecting score ring, RED
                (destructive) verdict, and the detected patterns as chips. */}
            <div
              className="mt-6 flex flex-col gap-4 pt-6 transition-all duration-500 motion-reduce:transition-none"
              style={{
                borderTop: "1px solid rgba(255,255,255,.1)",
                transform: verdictOn ? "translateY(0)" : "translateY(8px)",
                opacity: verdictOn ? 1 : 0,
                pointerEvents: verdictOn ? "auto" : "none",
              }}
              aria-hidden={!verdictOn}
            >
              {/* Score ring keeps its natural width; VERDICT and CONFIDENCE
                  split the remaining row width evenly (each flex-1). */}
              <div className="flex items-center gap-6">
                <DemoScoreRing score={score} />
                <div className="flex-1">
                  <div
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: "rgba(231,235,239,.5)" }}
                  >
                    Verdict
                  </div>
                  {/* Same verdict mapping as ResultsPage VERDICT_META:
                      Misleading → destructive (red) + X icon. */}
                  <div className="mt-0.5 flex items-center gap-1.5 text-destructive">
                    <X className="h-5 w-5" strokeWidth={2.5} />
                    <span className="text-lg font-bold">{TRUE_VERDICT}</span>
                  </div>
                </div>
                {/* Model confidence — the one real number not shown elsewhere on
                    the card. Eyebrow label above the figure, matching VERDICT. */}
                <div className="flex-1">
                  <div
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: "rgba(231,235,239,.5)" }}
                  >
                    Confidence
                  </div>
                  <div className="mt-0.5">
                    <span className="text-lg font-bold tabular-nums" style={{ color: INK }}>
                      {(TRUE_CONFIDENCE * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              {/* Detected patterns — the real key_features, as destructive
                  chips (ResultsPage renders these identically). */}
              <div>
                <div
                  className="mb-1.5 text-xs font-medium"
                  style={{ color: "rgba(231,235,239,.5)" }}
                >
                  Detected patterns
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TRUE_PATTERNS.map((w, i) => (
                    <Badge key={i} variant="destructive">
                      <TriangleAlert /> {w}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Scroll hint — fades out once the demo starts */}
          <div
            className="mt-6 text-center text-xs transition-opacity duration-300 motion-reduce:transition-none"
            style={{ opacity: clamp(1 - progress * 6), color: "rgba(231,235,239,.4)" }}
            aria-hidden="true"
          >
            ↓ Keep scrolling
          </div>
        </div>
      </div>
    </section>
  );
}
