// ============================================================
// SOURCES PAGE  (route: /sources)
// Full list of every seeded source-reliability rating (GET /api/sources),
// grouped by factual-reporting tier. Real, owned data only — same rows/bars as
// the sidebar (SourceRatingRow) for visual consistency. Inherits the global
// Navbar + Footer from the router Layout.
// ============================================================

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, TriangleAlert, ArrowLeft, ShieldCheck } from "lucide-react";
import type { SourceRatingItem } from "@/lib/types";
import { getSources, ApiError } from "@/lib/api";
import SourceRatingRow from "@/components/SourceRatingRow";
import Footer from "@/components/Footer";

// Tier display order, best first.
const TIER_ORDER = [
  "Very High",
  "High",
  "Mostly Factual",
  "Mixed",
  "Low",
  "Very Low",
];

function groupByTier(sources: SourceRatingItem[]) {
  const groups = TIER_ORDER.map((tier) => ({
    tier,
    items: sources
      .filter((s) => s.rating === tier)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);

  // Any unexpected/unknown rating labels go into a trailing "Other" group.
  const known = new Set(TIER_ORDER);
  const other = sources
    .filter((s) => !known.has(s.rating))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (other.length) groups.push({ tier: "Other", items: other });

  return groups;
}

export default function SourcesPage() {
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

  const groups = sources ? groupByTier(sources) : [];

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="h-4 w-4" /> Back to analyse
        </Link>

        <header className="mt-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Source reliability index
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Factual-reporting tiers for every seeded outlet, based on Media
              Bias/Fact Check-style levels. Ratings self-update from the system's
              own accumulated verdict history per source.
            </p>
          </div>
        </header>

        <div className="mt-8">
          {error ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
              <TriangleAlert className="h-4 w-4 text-warning" />
              {error}
            </div>
          ) : sources === null ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sources…
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-card">
              No source ratings available.
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map((g) => (
                <section key={g.tier}>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {g.tier}
                    </h2>
                    <span className="text-xs text-muted-foreground/60">
                      {g.items.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-x-8 gap-y-5 rounded-2xl border border-border bg-card p-5 shadow-card sm:grid-cols-2">
                    {g.items.map((s) => (
                      <SourceRatingRow
                        key={s.domain}
                        source={s}
                        variant="light"
                        showDomain
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {sources && (
          <p className="mt-8 text-xs text-muted-foreground">
            {sources.length} sources · seeded from Media Bias/Fact Check tiers,
            served by <code>GET /api/sources</code>.
          </p>
        )}
      </main>

      <Footer />
    </>
  );
}
