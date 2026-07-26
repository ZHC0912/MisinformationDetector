// ============================================================
// VERDICT CHIP — soft-bg + darker-text pill for a fact-check rating.
// Colour maps from the normalised ratingClass; the label prefers the
// publisher's own short textualRating, falling back to a tidy word.
// ============================================================

import { cn } from "@/lib/utils";

const CLASS_STYLES: Record<string, string> = {
  TRUE: "bg-success-muted text-success",
  FALSE: "bg-destructive-muted text-destructive",
  "PARTIALLY TRUE": "bg-warning-muted text-warning",
  UNVERIFIABLE: "bg-muted text-muted-foreground",
};

const CLASS_FALLBACK_LABEL: Record<string, string> = {
  TRUE: "True",
  FALSE: "False",
  "PARTIALLY TRUE": "Partly true",
  UNVERIFIABLE: "Unverified",
};

export default function VerdictChip({
  verdict,
  ratingClass,
  className,
}: {
  verdict: string;
  ratingClass: string;
  className?: string;
}) {
  const style = CLASS_STYLES[ratingClass] ?? CLASS_STYLES.UNVERIFIABLE;
  // Use the publisher's own rating when it's short enough to read as a chip;
  // otherwise fall back to the normalised class word.
  const raw = (verdict || "").trim();
  const label =
    raw && raw.length <= 22 ? raw : CLASS_FALLBACK_LABEL[ratingClass] ?? "Unverified";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        style,
        className
      )}
      title={raw || ratingClass}
    >
      {label}
    </span>
  );
}
