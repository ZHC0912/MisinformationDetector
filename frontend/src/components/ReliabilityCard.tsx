// ============================================================
// RELIABILITY CARD — dark navy sidebar of source-reliability ratings.
// Data source: GET /api/sources → the project's own seeded MongoDB ratings
// (Media Bias/Fact Check factual-reporting tiers). Real, owned data — no
// invented aggregate percentages, no fabricated source counts.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { SourceRatingItem } from "@/lib/types";
import { getSources, ApiError } from "@/lib/api";

// Tier fill (0..5) as a fraction of the meter width.
function tierWidth(tier: number | null): string {
  if (tier === null || tier === undefined) return "0%";
  return `${Math.round((tier / 5) * 100)}%`;
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

  return (
    <aside className="rounded-2xl bg-surface p-5 text-surface-foreground shadow-card">
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
        ) : sources.length === 0 ? (
          <p className="text-sm text-surface-foreground/50">No ratings available.</p>
        ) : (
          <ul className="max-h-[560px] space-y-3.5 overflow-y-auto pr-1">
            {sources.map((s) => (
              <li key={s.domain}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{s.name}</span>
                  <span className="shrink-0 text-xs font-medium text-surface-foreground/60">
                    {s.rating}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: tierWidth(s.tier_index) }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-surface-foreground/40">
                  <span>{s.bias}</span>
                  {s.category && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{s.category}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 border-t border-surface-muted pt-3 text-[11px] leading-relaxed text-surface-foreground/40">
        Seeded from Media Bias/Fact Check tiers; ratings self-update from the
        system's own verdict history per source.
      </p>
    </aside>
  );
}
