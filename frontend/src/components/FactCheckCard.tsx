// ============================================================
// FACT-CHECK CARD — one real published fact-check in the feed.
// Data source: Google Fact Check Tools API (ClaimReview). Every field here
// is real; nothing is synthesised. No bias meter (the API exposes no bias).
// ============================================================

import { ArrowUpRight } from "lucide-react";
import type { FactCheckItem } from "@/lib/types";
import VerdictChip from "@/components/VerdictChip";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FactCheckCard({ item }: { item: FactCheckItem }) {
  const date = formatDate(item.reviewDate);

  return (
    <article className="flex min-h-[240px] flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold uppercase tracking-wider text-brand">
          {item.publisher || "Fact-checker"}
        </span>
        {date && (
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.reviewDate}>
            {date}
          </time>
        )}
      </div>

      <p className="mt-3 line-clamp-4 font-display text-[15px] font-semibold leading-snug text-card-foreground">
        {item.claim || "(claim text unavailable)"}
      </p>

      {item.claimant && (
        <p className="mt-2 text-xs text-muted-foreground">
          Claimed by <span className="font-medium text-foreground">{item.claimant}</span>
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
        <VerdictChip verdict={item.verdict} ratingClass={item.ratingClass} />
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Read the fact-check
            <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
}
