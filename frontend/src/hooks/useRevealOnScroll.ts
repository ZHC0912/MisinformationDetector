// ============================================================
// useRevealOnScroll
// A lightweight "animate once when scrolled into view" primitive,
// shared by every static landing section. Unlike ScrollDemo, this
// is a one-shot reveal: it fires the first time the element enters
// the viewport and then stays revealed (does NOT reverse on
// scroll-up). Respects prefers-reduced-motion by revealing instantly.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Observe an element; `visible` flips true once, the first time it enters view. */
export function useRevealOnScroll<T extends Element = HTMLDivElement>(
  threshold = 0.2
) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, visible]);

  return { ref, visible };
}

/** Shared reveal classes. `slide` adds an upward translate; opacity always fades. */
export function revealClass(visible: boolean, slide = true) {
  return cn(
    "transition-all duration-700 ease-out motion-reduce:transition-none",
    visible
      ? "translate-y-0 opacity-100"
      : cn("opacity-0", slide && "translate-y-4")
  );
}

/** Ease a number from 0 → `target` once `active` becomes true (rAF, one-shot). */
export function useCountUp(target: number, active: boolean, duration = 1200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);

  return value;
}
