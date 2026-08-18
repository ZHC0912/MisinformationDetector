// ============================================================
// SCROLL-DRIVEN DEMO  (dark — lives inside the landing page)
// Demonstrates what the NLP model does: as the user scrolls
// through this section, manipulation-language words highlight
// one-by-one and a credibility verdict fades in. Everything is
// tied to scroll POSITION (0→1 progress), so it reverses smoothly
// when scrolling up. No animation library — plain React state +
// CSS transitions.
//
// IMPORTANT: this is ILLUSTRATIVE, not a live analysis. The
// sentence and score are hardcoded (the score simply eases 100→62
// with scroll); it does NOT call the backend. It is labelled as a
// sample, matching the hero mock's honesty line.
// ============================================================

import { useEffect, useRef, useState, type RefObject } from "react";

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

// Palette (matches the landing's dark theme).
const INK = "#E7EBEF";
const WARN = "#F5B43F";
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
  { t: " truth they're hiding — " },
  { t: "you won't believe", warn: 2 },
  { t: " it. " },
  { t: "Share before it's deleted", warn: 3 },
  { t: "!" },
];

// Scroll fraction at which each highlighted span switches on (staggered).
const THRESHOLDS = [0.18, 0.36, 0.54, 0.72];
const VERDICT_AT = 0.6; // result card starts fading in here

export default function ScrollDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const scrolled = useScrollProgress(sectionRef);
  const reduced = usePrefersReducedMotion();

  // Reduced motion → fully-revealed static view (no scrolling required).
  // Otherwise the reveal is driven by scroll position through the section.
  const progress = reduced ? 1 : scrolled;

  // Credibility score eases from 100 → 62 across the scroll range.
  const score = Math.round(100 - clamp((progress - 0.15) / 0.6) * 38);
  const verdictOn = progress >= VERDICT_AT;
  const flaggedCount = THRESHOLDS.filter((t) => progress >= t).length;

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
              Live demonstration
            </span>
            <p className="mt-2 text-sm" style={{ color: "rgba(231,235,239,.6)" }}>
              Scroll to watch the model flag the language patterns it was trained
              to catch.
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(231,235,239,.4)" }}>
              Illustrative sample — not a real assessment.
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

            {/* Result card — fades/slides in as the verdict forms */}
            <div
              className="mt-6 flex items-center gap-4 pt-6 transition-all duration-500 motion-reduce:transition-none"
              style={{
                borderTop: "1px solid rgba(255,255,255,.1)",
                transform: verdictOn ? "translateY(0)" : "translateY(8px)",
                opacity: verdictOn ? 1 : 0,
                pointerEvents: verdictOn ? "auto" : "none",
              }}
              aria-hidden={!verdictOn}
            >
              <div
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full"
                style={{ border: `2px solid ${WARN}`, color: WARN }}
              >
                <span className="text-lg font-bold leading-none tabular-nums">
                  {score}
                </span>
                <span className="text-[10px]" style={{ color: "rgba(231,235,239,.5)" }}>
                  /100
                </span>
              </div>
              <div>
                <div
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "rgba(231,235,239,.5)" }}
                >
                  Verdict
                </div>
                <div className="text-lg font-bold" style={{ color: WARN }}>
                  Potentially Misleading
                </div>
                <div className="text-xs" style={{ color: "rgba(231,235,239,.55)" }}>
                  {flaggedCount} manipulation pattern
                  {flaggedCount === 1 ? "" : "s"} detected
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
