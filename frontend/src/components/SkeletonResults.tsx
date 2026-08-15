// ============================================================
// SKELETON RESULTS
// Shimmer placeholder shown while an analysis is running, so the
// wait feels faster than a single spinner.
// ============================================================

import { Loader2 } from "lucide-react";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function SkeletonResults() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div
        className="space-y-6"
        aria-busy="true"
        aria-label="Analysing content"
      >
        {/* Header */}
        <div className="space-y-2">
          <Bar className="h-6 w-56" />
          <Bar className="h-3 w-40" />
        </div>

        {/* Verdict + score ring + confidence bars */}
        <div className="flex items-center gap-6">
          <Bar className="h-28 w-28 rounded-full" />
          <div className="flex-1 space-y-3">
            <Bar className="h-3 w-32" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-2/3" />
          </div>
        </div>

        {/* Explanation / fact-check blocks */}
        <Bar className="h-24 w-full" />
        <Bar className="h-24 w-full" />

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analysing content — running DistilBERT and fact-checking…
        </div>
      </div>
    </main>
  );
}
