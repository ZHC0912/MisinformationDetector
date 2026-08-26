// ============================================================
// NAVBAR (global, MIDAS identity)
// Dark navy bar: logo · centred fact-check SEARCH · nav links.
//
// The centred search drives the "Recently fact-checked" FEED, not the
// analysis model. Because this navbar is global (rendered by Layout on every
// route), submitting navigates to /app?q=<topic> — so a search from the landing
// or evaluation page lands on /app with that query applied to the feed.
// ============================================================

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Search, BarChart3, ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchLock } from "@/components/SearchLockContext";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onApp = location.pathname.startsWith("/app");

  // A routed page (the /app results view) can disable the feed search so a
  // search can't navigate away and discard an in-progress analysis. `reason`
  // is the tooltip / SR explanation; null means enabled.
  const { reason: searchLock } = useSearchLock();
  const searchDisabled = searchLock !== null;

  // Keep the field in sync with the active feed query when on /app.
  const [q, setQ] = useState("");
  useEffect(() => {
    if (onApp) setQ(searchParams.get("q") ?? "");
  }, [onApp, searchParams]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchDisabled) return; // locked by the current page (e.g. results view)
    const topic = q.trim();
    // Drives the feed only — never runs the analysis model.
    navigate(topic ? `/app?q=${encodeURIComponent(topic)}` : "/app");
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-surface-muted bg-surface text-surface-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        {/* Logo / wordmark */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="MIDAS — home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
            <ShieldCheck className="h-[18px] w-[18px]" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">
            MIDAS
          </span>
        </Link>

        {/* Centred fact-check feed search */}
        <form
          role="search"
          onSubmit={submitSearch}
          className="relative mx-auto flex w-full min-w-0 max-w-xl items-center"
        >
          <Search
            className={cn(
              "pointer-events-none absolute left-3.5 h-4 w-4 text-surface-foreground/50",
              searchDisabled && "opacity-50"
            )}
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // readOnly (not `disabled`) so it stays focusable and screen readers
            // still reach it; aria-disabled + the described reason announce WHY.
            readOnly={searchDisabled}
            aria-disabled={searchDisabled || undefined}
            aria-describedby={searchDisabled ? "nav-search-lock" : undefined}
            title={searchDisabled ? searchLock ?? undefined : undefined}
            placeholder={searchDisabled ? "Search paused" : "Search fact-checks by topic…"}
            aria-label="Search recently fact-checked claims"
            className={cn(
              "h-10 w-full rounded-full border border-surface-muted bg-surface-subtle pl-10 pr-4 text-sm",
              "text-surface-foreground placeholder:text-surface-foreground/45",
              "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand",
              searchDisabled && "cursor-not-allowed opacity-50"
            )}
          />
          {searchDisabled && (
            <span id="nav-search-lock" className="sr-only">
              {searchLock}
            </span>
          )}
        </form>

        {/* Nav links */}
        <nav className="flex shrink-0 items-center gap-1">
          <NavItem
            active={onApp}
            onClick={() => navigate("/app")}
            icon={<ScanSearch className="h-4 w-4" />}
            label="Analyse"
          />
          <NavItem
            active={location.pathname.startsWith("/evaluation")}
            onClick={() => navigate("/evaluation")}
            icon={<BarChart3 className="h-4 w-4" />}
            label="Evaluation"
          />
        </nav>
      </div>
    </header>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active
          ? "text-brand"
          : "text-surface-foreground/70 hover:bg-surface-subtle hover:text-surface-foreground"
      )}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
