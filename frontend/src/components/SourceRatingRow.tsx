// ============================================================
// SOURCE RATING ROW — shared row/bar treatment used by BOTH the sidebar
// ReliabilityCard (dark navy) and the full /sources page (light), so the two
// stay visually consistent. Real data only (GET /api/sources).
// ============================================================

import { cn } from "@/lib/utils";
import type { SourceRatingItem } from "@/lib/types";

// Tier fill (0..5) as a fraction of the meter width.
export function tierWidth(tier: number | null): string {
  if (tier === null || tier === undefined) return "0%";
  return `${Math.round((tier / 5) * 100)}%`;
}

export default function SourceRatingRow({
  source: s,
  variant = "light",
  showDomain = false,
}: {
  source: SourceRatingItem;
  variant?: "dark" | "light";
  showDomain?: boolean;
}) {
  const dark = variant === "dark";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "truncate text-sm font-semibold",
            dark ? "text-surface-foreground" : "text-foreground"
          )}
        >
          {s.name}
        </span>
        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            dark ? "text-surface-foreground/60" : "text-muted-foreground"
          )}
        >
          {s.rating}
        </span>
      </div>

      <div
        className={cn(
          "mt-1.5 h-1.5 w-full overflow-hidden rounded-full",
          dark ? "bg-surface-muted" : "bg-secondary"
        )}
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: tierWidth(s.tier_index) }}
        />
      </div>

      <div
        className={cn(
          "mt-1 flex items-center gap-1.5 text-[11px]",
          dark ? "text-surface-foreground/40" : "text-muted-foreground"
        )}
      >
        {showDomain && s.domain && (
          <>
            <span className="truncate font-medium">{s.domain}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{s.bias}</span>
        {s.category && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{s.category}</span>
          </>
        )}
      </div>
    </div>
  );
}
