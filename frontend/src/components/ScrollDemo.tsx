// ============================================================
// SCROLL-DRIVEN DEMO
// Demonstrates what the NLP model does: as the user scrolls
// through this section, words matching the backend's real
// WARNING_WORDS list highlight one-by-one, and a credibility
// verdict fades in. Everything is tied to scroll POSITION
// (0→1 progress), so it reverses smoothly when scrolling up.
// No animation library — plain React state + CSS transitions.
// ============================================================

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

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

// The demo sentence, split into segments. `warn` marks a segment as a
// WARNING_WORDS match; its number is the index into THRESHOLDS below.
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
  const progress = useScrollProgress(sectionRef);

  // Credibility score eases from 100 → 62 across the scroll range.
  const score = Math.round(100 - clamp((progress - 0.15) / 0.6) * 38);
  const verdictOn = progress >= VERDICT_AT;
  const flaggedCount = THRESHOLDS.filter((t) => progress >= t).length;

  return (
    <section ref={sectionRef} className="relative h-[220vh] bg-brand/5">
      {/* Sticky stage: stays centred while the tall section scrolls past it */}
      <div className="sticky top-0 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 text-center">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Live demonstration
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              Scroll to watch the model flag the language patterns it was
              trained to catch.
            </p>
          </div>

          {/* The sentence under analysis */}
          <div className="rounded-lg border bg-card p-6 sm:p-8">
            <p className="text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl">
              {SEGMENTS.map((seg, i) => {
                if (seg.warn === undefined) return <span key={i}>{seg.t}</span>;
                const active = progress >= THRESHOLDS[seg.warn];
                return (
                  <span
                    key={i}
                    className={cn(
                      "rounded px-1 transition-colors duration-500 [-webkit-box-decoration-break:clone] [box-decoration-break:clone] motion-reduce:transition-none",
                      active
                        ? "bg-destructive-muted text-destructive"
                        : "bg-transparent text-foreground"
                    )}
                  >
                    {seg.t}
                  </span>
                );
              })}
            </p>

            {/* Result card — fades/slides in as the verdict forms */}
            <div
              className={cn(
                "mt-6 flex items-center gap-4 border-t pt-6 transition-all duration-500 motion-reduce:transition-none",
                verdictOn
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              )}
              aria-hidden={!verdictOn}
            >
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-warning text-warning">
                <span className="text-lg font-bold leading-none tabular-nums">
                  {score}
                </span>
                <span className="text-[10px] text-muted-foreground">/100</span>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Verdict
                </div>
                <div className="text-lg font-bold text-warning">
                  Potentially Misleading
                </div>
                <div className="text-xs text-muted-foreground">
                  {flaggedCount} manipulation pattern
                  {flaggedCount === 1 ? "" : "s"} detected
                </div>
              </div>
            </div>
          </div>

          {/* Scroll hint — fades out once the demo starts */}
          <div
            className="mt-6 text-center text-xs text-muted-foreground transition-opacity duration-300 motion-reduce:transition-none"
            style={{ opacity: clamp(1 - progress * 6) }}
            aria-hidden="true"
          >
            ↓ Keep scrolling
          </div>
        </div>
      </div>
    </section>
  );
}
