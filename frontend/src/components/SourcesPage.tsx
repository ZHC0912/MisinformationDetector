// ============================================================
// SOURCES PAGE  (route: /sources) — master-detail source reliability index.
// LEFT: searchable + sortable list of every seeded source (GET /api/sources).
// RIGHT: details for the selected source. Real, owned data only — no invented
// outlets or fields. Reuses the shared SourceRatingRow bar treatment plus the
// MIDAS navy header band + reveal/card recipe used on /evaluation and /app;
// inherits the global Navbar + Footer from the router Layout.
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
import { cn } from "@/lib/utils";
import { useRevealOnScroll, revealClass } from "@/hooks/useRevealOnScroll";

type SortKey = "tier" | "name";

// Fine-grain noise texture — same treatment as the /app hero, results band and
// /evaluation header. Data-URI, no asset dependency.
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

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

// ── Reveal-on-scroll card (presentation only) ─────────────────
// Matched radius + soft shadow + reveal-on-scroll (shared hook); optional hover
// lift, exactly as EvaluationPage / ResultsPage RevealCard. Static under
// prefers-reduced-motion.
function RevealCard({
  index = 0,
  hover = false,
  className,
  children,
}: {
  index?: number;
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${Math.min(index, 7) * 60}ms` : "0ms" }}
      className={cn(
        "rounded-3xl border border-border bg-card shadow-card",
        hover &&
          "transition-all hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:transition-none",
        revealClass(visible),
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Reveal-on-scroll list row (per-row stagger) ───────────────
function RevealRow({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLLIElement>();
  return (
    <li
      ref={ref}
      style={{ transitionDelay: visible ? `${Math.min(index, 10) * 40}ms` : "0ms" }}
      className={revealClass(visible)}
    >
      {children}
    </li>
  );
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
    <main className="w-full space-y-6 px-6 py-8 sm:px-8 sm:py-10">
      {/* MIDAS header band — dark navy with the same glow + grain recipe as the
          /app hero and the /evaluation header. Title, description and the
          Back-to-analyse action live here; everything below stays light. */}
      <section className="relative overflow-hidden rounded-3xl bg-surface px-6 py-8 text-surface-foreground shadow-card sm:px-10 sm:py-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 120% at 12% -10%, rgba(249,115,22,0.18), rgba(249,115,22,0) 55%), radial-gradient(90% 90% at 108% 120%, rgba(249,115,22,0.10), rgba(249,115,22,0) 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.1,
            mixBlendMode: "overlay",
            backgroundSize: "180px 180px",
            backgroundImage: `url("${GRAIN}")`,
          }}
        />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
              Source reliability
            </span>
            <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              Source reliability index
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-surface-foreground/70">
              Factual-reporting tiers for every seeded outlet, based on Media
              Bias/Fact Check-style levels. Ratings self-update from the system's
              own accumulated verdict history per source.
            </p>
          </div>
          <Link
            to="/app"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-medium text-surface-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-4 w-4" /> Back to analyse
          </Link>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
          <TriangleAlert className="h-4 w-4 text-warning" />
          {error}
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sources…
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* LEFT PANE — searchable / sortable list. Flows with the page (no
              nested scrollbar); the detail pane sticks alongside it. */}
          <div className="w-full lg:w-[380px] lg:shrink-0">
            <RevealCard className="p-3">
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
                <ul className="mt-2 space-y-1">
                  {visible.map((s, i) => {
                    const isSelected = s.domain === selected;
                    return (
                      <RevealRow key={s.domain} index={i}>
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
                      </RevealRow>
                    );
                  })}
                </ul>
              )}
            </RevealCard>
          </div>

          {/* RIGHT PANE — detail. Sticky + content-height so it stays aligned
              with the list while scanning and never leaves a void below itself. */}
          <div className="w-full lg:sticky lg:top-6 lg:flex-1 lg:self-start">
            {selectedItem ? (
              <RevealCard hover className="p-6 sm:p-8">
                {/* Outlet name + domain — the domain appears ONCE, here. */}
                <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
                  {selectedItem.name}
                </h2>
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  <span className="truncate">{selectedItem.domain}</span>
                </div>

                {/* Reliability tier — carries the most weight: the factual-
                    reporting rating shown ONCE (as the emphasised label), the
                    tier number, and the meter. */}
                <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Factual reporting
                      </div>
                      <div className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                        {selectedItem.rating || "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-medium text-muted-foreground">
                        Tier
                      </div>
                      <div className="mt-1 font-bold tabular-nums text-foreground">
                        <span className="text-2xl">
                          {selectedItem.tier_index === null
                            ? "—"
                            : selectedItem.tier_index}
                        </span>
                        <span className="text-muted-foreground"> / 5</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: tierWidth(selectedItem.tier_index) }}
                    />
                  </div>
                </div>

                {/* Remaining metadata — tight two-up (rating + domain live above,
                    so they're not repeated here). */}
                <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5">
                  <DetailField label="Bias / lean" value={selectedItem.bias} />
                  <DetailField label="Category" value={selectedItem.category} />
                </dl>

                {/* Website link — label drops the domain (shown once above). */}
                <a
                  href={`https://${selectedItem.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-7 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Visit website
                  <ArrowUpRight className="h-4 w-4" />
                </a>

                <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                  Seeded from Media Bias/Fact Check tiers; ratings self-update
                  from this system's own verdict history per source.
                </p>
              </RevealCard>
            ) : (
              <RevealCard className="p-10 text-center text-sm text-muted-foreground">
                Select a source to view its details.
              </RevealCard>
            )}
          </div>
        </div>
      )}
    </main>
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
