// ============================================================
// RELIABILITY CARD — dark navy sidebar of source-reliability ratings.
// Data source: GET /api/sources → the project's own seeded MongoDB ratings
// (Media Bias/Fact Check factual-reporting tiers). Real, owned data.
//
// The sidebar shows only a short set of well-known outlets (deduped); the full
// list lives on the /sources page via "View all sources".
// ============================================================

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import type { SourceRatingItem } from "@/lib/types";
import { getSources, ApiError } from "@/lib/api";
import SourceRatingRow from "@/components/SourceRatingRow";
import { cn } from "@/lib/utils";
import { useRevealOnScroll, revealClass } from "@/hooks/useRevealOnScroll";

// Fine-grain noise texture — same treatment as the landing's dark atmosphere.
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

// A short, well-known set for the sidebar — one entry per outlet (deduped by
// domain, so BBC appears once). Picked from the REAL fetched data, in order.
const FEATURED_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "nytimes.com",
  "theguardian.com",
  "npr.org",
];

function pickFeatured(sources: SourceRatingItem[]): SourceRatingItem[] {
  const byDomain = new Map(sources.map((s) => [s.domain, s]));
  const featured = FEATURED_DOMAINS.map((d) => byDomain.get(d)).filter(
    (s): s is SourceRatingItem => Boolean(s)
  );
  if (featured.length >= 5) return featured;
  // Fallback (unexpected data): top-rated, deduped by name.
  const seen = new Set(featured.map((s) => s.name));
  for (const s of sources) {
    if (featured.length >= 6) break;
    if (!seen.has(s.name)) {
      seen.add(s.name);
      featured.push(s);
    }
  }
  return featured;
}

export default function ReliabilityCard() {
  const [sources, setSources] = useState<SourceRatingItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSources()
      .then((res) => {
        if (!cancelled) setSources(res.sources);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Could not load ratings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = sources ? pickFeatured(sources) : [];
  // Presentation-only reveal-on-scroll (reuses the landing's hook).
  const { ref, visible } = useRevealOnScroll<HTMLElement>();

  return (
    <aside
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-3xl bg-surface p-5 text-surface-foreground shadow-card",
        revealClass(visible)
      )}
    >
      {/* Atmosphere — soft orange glow + fine grain, lifted from the landing. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 100% -10%, rgba(249,115,22,0.14), rgba(249,115,22,0) 55%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.08,
          mixBlendMode: "overlay",
          backgroundSize: "160px 160px",
          backgroundImage: `url("${GRAIN}")`,
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-surface-foreground/60">
            Source reliability
          </h2>
        </div>
        <p className="mt-1 text-sm text-surface-foreground/50">
          Factual-reporting tiers (MBFC-style) for known outlets.
        </p>

        <div className="mt-4">
        {error ? (
          <p className="text-sm text-surface-foreground/50">{error}</p>
        ) : sources === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-surface-foreground/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading ratings…
          </div>
        ) : featured.length === 0 ? (
          <p className="text-sm text-surface-foreground/50">No ratings available.</p>
        ) : (
          <ul className="space-y-3.5">
            {featured.map((s) => (
              <li key={s.domain}>
                <SourceRatingRow source={s} variant="dark" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {sources && sources.length > featured.length && (
        <Link
          to="/sources"
          className="mt-5 inline-flex items-center gap-1 border-t border-surface-muted pt-4 text-sm font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          View all {sources.length} sources
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      </div>
    </aside>
  );
}
