// ============================================================
// ANALYSE PAGE  (route: /app) — MIDAS dashboard.
//
// Composes the new visual identity WITHOUT changing the analysis contract:
//   - HeroVerify: progressively-disclosed entry to the EXISTING analyse form.
//     All analysis state + handleAnalyse are unchanged from the original tool.
//   - Fact-check feed: real data from GET /api/fact-checks. The GLOBAL navbar
//     search drives it via the ?q= URL param (works cross-route).
//   - ReliabilityCard: real seeded ratings from GET /api/sources.
//
// The results view (SkeletonResults / ResultsPage) is rendered exactly as before
// and is NOT modified — analysis still flips the whole page into it.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TriangleAlert, Newspaper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ResultsPage from "@/components/ResultsPage";
import ErrorBoundary from "@/components/ErrorBoundary";
import SkeletonResults from "@/components/SkeletonResults";
import UrlModal, { type UrlSuccess } from "@/components/UrlModal";
import OcrModal, { type OcrSuccess } from "@/components/OcrModal";
import HeroVerify from "@/components/HeroVerify";
import FactCheckCard from "@/components/FactCheckCard";
import ReliabilityCard from "@/components/ReliabilityCard";
import { useSearchLock } from "@/components/SearchLockContext";
import { analyse, scrapeUrl, getFactChecks, ApiError } from "@/lib/api";
import type { AnalyseResult, FactCheckItem } from "@/lib/types";

export default function AnalysePage() {
  // ── Analysis state (unchanged contract) ─────────────────────
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quickError, setQuickError] = useState(""); // pill URL quick-lane feedback
  const [successMsg, setSuccessMsg] = useState("");
  const [modal, setModal] = useState<null | "url" | "ocr">(null);
  const [showResults, setShowResults] = useState(false);
  const [runLime, setRunLime] = useState(false);
  // opt-in — keeps the default path within the ≤5s NFR
  const [runShap, setRunShap] = useState(false);
  const [announce, setAnnounce] = useState(""); // aria-live announcements

  // ── Fact-check feed state ───────────────────────────────────
  // Two lazy-loaded sections (Malaysia default / Foreign). A global navbar ?q=
  // search overrides the region and searches the whole corpus. Only the ACTIVE
  // section is fetched; a client cache means switching back never re-fetches.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const feedQuery = (searchParams.get("q") ?? "").trim();
  const searching = feedQuery.length > 0;
  const [region, setRegion] = useState<"malaysia" | "foreign">("malaysia");
  const [feedItems, setFeedItems] = useState<FactCheckItem[] | null>(null);
  const [feedError, setFeedError] = useState("");
  const feedCache = useRef<Record<string, FactCheckItem[]>>({});
  const feedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const key = searching ? `q:${feedQuery.toLowerCase()}` : `r:${region}`;
    const cached = feedCache.current[key];
    if (cached) {
      setFeedItems(cached);
      setFeedError("");
      return;
    }
    let cancelled = false;
    setFeedItems(null);
    setFeedError("");
    getFactChecks(searching ? { query: feedQuery } : { region })
      .then((res) => {
        if (cancelled) return;
        feedCache.current[key] = res.items;
        setFeedItems(res.items);
      })
      .catch((err) => {
        if (!cancelled)
          setFeedError(err instanceof ApiError ? err.message : "Could not load fact-checks.");
      });
    return () => {
      cancelled = true;
    };
  }, [searching, feedQuery, region]);

  // On a search, smooth-scroll to the feed so the user sees the page move and
  // lands on the results (they load below the fold). Runs whenever the query
  // changes. Respects prefers-reduced-motion by jumping instead of animating.
  useEffect(() => {
    if (!searching || !feedRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    feedRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [searching, feedQuery]);

  // Clear the navbar search: drop ?q= and return to the region tabs.
  const clearSearch = () => navigate("/app");

  // Lock the GLOBAL navbar feed-search while a full-page view owns /app: the
  // results view (a search would navigate away and silently discard the user's
  // analysis) and, for consistency, while an analysis is loading. Cleanup on
  // unmount re-enables it, so /sources and /evaluation are never affected.
  const { setReason: setSearchLock } = useSearchLock();
  useEffect(() => {
    if (showResults) {
      setSearchLock("Finish or clear this analysis to search fact-checks.");
    } else if (loading) {
      setSearchLock("Analysis in progress — search resumes when it finishes.");
    } else {
      setSearchLock(null);
    }
    return () => setSearchLock(null);
  }, [showResults, loading, setSearchLock]);

  const handleUrlSuccess = ({ text: t, siteName, wordCount, label }: UrlSuccess) => {
    setText(t);
    if (siteName && !sourceName) setSourceName(siteName);
    setSuccessMsg(`Extracted ${wordCount} words from "${label}"`);
    setModal(null);
  };

  const handleOcrSuccess = ({ text: t, wordCount }: OcrSuccess) => {
    setText(t);
    setSuccessMsg(`Extracted ${wordCount} words from image`);
    setModal(null);
  };

  // Single analyse path. Callers may pass overrides (used by the URL quick-lane,
  // which supplies freshly-fetched text and forces SHAP/LIME off) — with no
  // overrides it reads the form state exactly as before.
  const handleAnalyse = useCallback(
    async (opts?: {
      textOverride?: string;
      sourceOverride?: string;
      runLimeOverride?: boolean;
      runShapOverride?: boolean;
    }) => {
      const analysisText = (opts?.textOverride ?? text).trim();
      if (analysisText.length < 20) {
        setError("Please enter at least 20 characters.");
        return;
      }
      setError("");
      setSuccessMsg("");
      setLoading(true);
      setResult(null);
      setAnnounce("Analysing content, please wait.");
      try {
        const data = await analyse({
          text: analysisText,
          source_name: (opts?.sourceOverride ?? sourceName).trim() || "Unknown Source",
          run_lime: opts?.runLimeOverride ?? runLime,
          run_shap: opts?.runShapOverride ?? runShap,
        });
        setResult(data);
        setShowResults(true);
        setAnnounce(`Analysis complete. Final verdict: ${data.final_verdict}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError("Cannot connect to backend on port 8000. Error: " + msg);
        setAnnounce("Analysis failed. " + msg);
      } finally {
        setLoading(false);
      }
    },
    [text, sourceName, runLime, runShap]
  );

  // URL quick-lane (the navy pill): fetch an article link via the SAME
  // scrapeUrl() the "Fetch from URL" button uses, fill the form state, then run
  // the single analyse path with SHAP/LIME forced OFF (fast path). Invalid /
  // non-URL input is not fetched — it shows an inline hint instead.
  const handleQuickVerify = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) {
        setQuickError("Paste an article link to verify, or use the form below for plain text.");
        return;
      }
      if (!/^https?:\/\/.+/i.test(url)) {
        setQuickError(
          "This box takes an article link (http:// or https://). To check plain text, paste it into the form below."
        );
        return;
      }
      setQuickError("");
      setError("");
      setSuccessMsg("");
      setLoading(true);
      setResult(null);
      setAnnounce("Fetching the article, please wait.");
      try {
        const data = await scrapeUrl(url);
        if (!data.text || data.text.trim().length < 20) {
          setLoading(false);
          setQuickError(
            "Couldn't extract enough text from that link. Try the URL importer below, or paste the text manually."
          );
          setAnnounce("Fetch failed — not enough text extracted.");
          return;
        }
        // Fill the form below so a Back from results shows a consistent, fully
        // populated state (not half-filled).
        setText(data.text);
        const src = data.site_name && !sourceName ? data.site_name : sourceName;
        if (data.site_name && !sourceName) setSourceName(data.site_name);
        await handleAnalyse({
          textOverride: data.text,
          sourceOverride: src,
          runLimeOverride: false, // fast path — explainability off regardless of the form checkboxes
          runShapOverride: false,
        });
      } catch (err) {
        setLoading(false);
        const msg = err instanceof ApiError ? err.message : "Couldn't fetch that link.";
        setQuickError(msg);
        setAnnounce("Fetch failed. " + msg);
      }
    },
    [sourceName, handleAnalyse]
  );

  const handleClear = () => {
    setText("");
    setSourceName("");
    setResult(null);
    setShowResults(false);
    setError("");
    setQuickError("");
    setSuccessMsg("");
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  // ── Results / skeleton views take over the whole page (unchanged) ──
  if (loading && !showResults) {
    return (
      <>
        <div className="sr-only" role="status" aria-live="polite">
          {announce}
        </div>
        <SkeletonResults />
      </>
    );
  }
  if (showResults && result) {
    return (
      <>
        <div className="sr-only" role="status" aria-live="polite">
          {announce}
        </div>
        <ErrorBoundary onReset={() => setShowResults(false)}>
          <ResultsPage
            result={result}
            submittedText={text}
            limeRequested={runLime}
            shapRequested={runShap}
            onBack={() => setShowResults(false)}
            onClear={handleClear}
          />
        </ErrorBoundary>
      </>
    );
  }

  // ── Browse / dashboard view ─────────────────────────────────
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <HeroVerify
          text={text}
          setText={setText}
          sourceName={sourceName}
          setSourceName={setSourceName}
          runLime={runLime}
          setRunLime={setRunLime}
          runShap={runShap}
          setRunShap={setRunShap}
          wordCount={wordCount}
          loading={loading}
          error={error}
          quickError={quickError}
          successMsg={successMsg}
          onQuickVerify={handleQuickVerify}
          onAnalyse={handleAnalyse}
          onClear={handleClear}
          onOpenUrl={() => setModal("url")}
          onOpenOcr={() => setModal("ocr")}
        />

        <div className="mt-14 grid gap-8 sm:mt-16 lg:grid-cols-[1fr_320px]">
          {/* Fact-check feed */}
          <section ref={feedRef} aria-labelledby="feed-heading" className="scroll-mt-24">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2
                  id="feed-heading"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Recently fact-checked
                </h2>
                <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                  {feedQuery
                    ? `Results for “${feedQuery}”`
                    : "Attributed claims by public figures"}
                </p>
                {searching ? (
                  // Result context: what was searched + how many came back, plus
                  // an inline way to clear the search and return to the tabs.
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span aria-live="polite">
                      {feedItems === null
                        ? `Searching for “${feedQuery}”…`
                        : `${feedItems.length} ${
                            feedItems.length === 1 ? "result" : "results"
                          } for “${feedQuery}”`}
                    </span>
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="inline-flex items-center gap-1 font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="h-3.5 w-3.5" /> Clear search
                    </button>
                  </p>
                ) : (
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    Fact-checked statements attributed to a named speaker, drawn
                    from Google&rsquo;s ClaimReview corpus.
                  </p>
                )}
              </div>

              {/* Right side of the header band: region tabs above the attribution */}
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                {!searching && (
                  <div
                    className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm"
                    role="tablist"
                    aria-label="Fact-check region"
                  >
                    {(["malaysia", "foreign"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="tab"
                        aria-selected={region === r}
                        onClick={() => setRegion(r)}
                        className={cn(
                          "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                          region === r
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {r === "malaysia" ? "Malaysia" : "Foreign"}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Source: Google Fact Check Tools · ClaimReview
                </p>
              </div>
            </div>

            <div className="mt-5">
              {feedError ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
                  <TriangleAlert className="h-4 w-4 text-warning" />
                  {feedError}
                </div>
              ) : feedItems === null ? (
                // Loading: skeleton cards in the same 2-col grid so the layout
                // doesn't jump when results arrive. Status text for screen readers.
                <div>
                  <p className="sr-only" role="status" aria-live="polite">
                    {searching ? `Searching for ${feedQuery}` : "Loading fact-checks"}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="animate-pulse rounded-2xl border border-border bg-card p-5 shadow-card"
                      >
                        <div className="h-3 w-24 rounded bg-muted" />
                        <div className="mt-3 h-4 w-full rounded bg-muted" />
                        <div className="mt-2 h-4 w-4/5 rounded bg-muted" />
                        <div className="mt-5 flex items-center gap-2">
                          <div className="h-6 w-16 rounded-full bg-muted" />
                          <div className="h-3 w-20 rounded bg-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : feedItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-card">
                  <Newspaper className="h-6 w-6 text-muted-foreground/60" />
                  {searching
                    ? `No attributed fact-checks found for “${feedQuery}”. Try another topic.`
                    : `No attributed fact-checks available in the ${
                        region === "malaysia" ? "Malaysia" : "Foreign"
                      } section right now. Check back later.`}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* hard cap: never render more than 8 cards per section */}
                  {feedItems.slice(0, 8).map((item, i) => (
                    <FactCheckCard key={`${item.url}-${i}`} item={item} index={i} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Reliability sidebar */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <ReliabilityCard />
          </div>
        </div>
      </main>

      <UrlModal
        open={modal === "url"}
        onOpenChange={(o) => setModal(o ? "url" : null)}
        onSuccess={handleUrlSuccess}
      />
      <OcrModal
        open={modal === "ocr"}
        onOpenChange={(o) => setModal(o ? "ocr" : null)}
        onSuccess={handleOcrSuccess}
      />
    </>
  );
}
