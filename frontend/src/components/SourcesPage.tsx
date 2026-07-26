// ============================================================
// SOURCES PAGE  (route: /sources) — left-aligned master-detail.
// LEFT: searchable + sortable list of every seeded source (GET /api/sources).
// RIGHT: details for the selected source. Real, owned data only — no invented
// outlets or fields. Reuses the shared SourceRatingRow bar treatment and MIDAS
// styling; inherits the global Navbar + Footer from the router Layout.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Globe,
  ArrowUpRight,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import type { SourceRatingItem } from "@/lib/types";
import { getSources, ApiError } from "@/lib/api";
import SourceRatingRow, { tierWidth } from "@/components/SourceRatingRow";
import Footer from "@/components/Footer";
import { cn } from "@/lib/utils";

type SortKey = "tier" | "name";

// Dedupe by outlet name (the data has two BBC domains → keep the first, which is
// the highest-tier occurrence since the API returns rows tier-sorted).
function dedupeByName(sources: SourceRatingItem[]): SourceRatingItem[] {
  const seen = new Set<string>();
  const out: SourceRatingItem[] = [];
  for (const s of sources) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value || "—"}</dd>
    </div>
  );
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRatingItem[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("tier");
  const [selected, setSelected] = useState<string | null>(null); // domain key

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

  const deduped = useMemo(() => dedupeByName(sources ?? []), [sources]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = deduped;
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort(
        (a, b) =>
          (b.tier_index ?? -1) - (a.tier_index ?? -1) ||
          a.name.localeCompare(b.name)
      );
    }
    return sorted;
  }, [deduped, query, sortBy]);

  // Auto-select the first source once data is available, so the pane is never blank.
  useEffect(() => {
    if (selected === null && deduped.length > 0) setSelected(deduped[0].domain);
  }, [deduped, selected]);

  const selectedItem = useMemo(
    () => deduped.find((s) => s.domain === selected) ?? null,
    [deduped, selected]
  );

  const loading = sources === null && !error;

  return (
    <>
      <main className="w-full px-6 py-8 sm:px-8 sm:py-10">
        {/* Top-left header */}
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="h-4 w-4" /> Back to analyse
        </Link>

        <header className="mt-4 max-w-2xl">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Source reliability index
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Factual-reporting tiers for every seeded outlet, based on Media
            Bias/Fact Check-style levels. Ratings self-update from the system's
            own accumulated verdict history per source.
          </p>
        </header>

        {error ? (
          <div className="mt-8 flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
            <TriangleAlert className="h-4 w-4 text-warning" />
            {error}
          </div>
        ) : loading ? (
          <div className="mt-8 flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sources…
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* LEFT PANE — searchable / sortable list */}
            <div className="w-full lg:w-[380px] lg:shrink-0">
              <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
                {/* Search */}
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by outlet or domain…"
                    aria-label="Filter sources by outlet name or domain"
                    className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                {/* Sort toggle */}
                <div className="mt-2 flex items-center gap-2 px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Sort
                  </span>
                  <div className="flex rounded-lg border border-border p-0.5">
                    <SortButton
                      active={sortBy === "tier"}
                      onClick={() => setSortBy("tier")}
                    >
                      Tier
                    </SortButton>
                    <SortButton
                      active={sortBy === "name"}
                      onClick={() => setSortBy("name")}
                    >
                      Name
                    </SortButton>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground/70">
                    {visible.length}
                  </span>
                </div>

                {/* List */}
                {visible.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No outlets match “{query}”.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 lg:max-h-[calc(100vh-340px)] lg:overflow-y-auto">
                    {visible.map((s) => {
                      const isSelected = s.domain === selected;
                      return (
                        <li key={s.domain}>
                          <button
                            type="button"
                            onClick={() => setSelected(s.domain)}
                            aria-current={isSelected ? "true" : undefined}
                            className={cn(
                              "w-full rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                              isSelected
                                ? "bg-secondary ring-1 ring-brand/40"
                                : "hover:bg-secondary/60"
                            )}
                          >
                            <SourceRatingRow source={s} variant="light" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* RIGHT PANE — detail */}
            <div className="w-full lg:flex-1">
              {selectedItem ? (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
                        {selectedItem.name}
                      </h2>
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Globe className="h-4 w-4" />
                        <span className="truncate">{selectedItem.domain}</span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-foreground">
                      {selectedItem.rating}
                    </span>
                  </div>

                  {/* Reliability bar */}
                  <div className="mt-6 max-w-md">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>Reliability tier</span>
                      <span>
                        {selectedItem.tier_index === null
                          ? "—"
                          : `${selectedItem.tier_index} / 5`}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: tierWidth(selectedItem.tier_index) }}
                      />
                    </div>
                  </div>

                  {/* Fields (only real /api/sources fields) */}
                  <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                    <DetailField label="Factual reporting" value={selectedItem.rating} />
                    <DetailField label="Bias / lean" value={selectedItem.bias} />
                    <DetailField label="Category" value={selectedItem.category} />
                    <DetailField label="Domain" value={selectedItem.domain} />
                  </dl>

                  {/* Website link */}
                  <a
                    href={`https://${selectedItem.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-8 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Visit {selectedItem.domain}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>

                  <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                    Seeded from Media Bias/Fact Check tiers; ratings self-update
                    from this system's own verdict history per source.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-card">
                  Select a source to view its details.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
