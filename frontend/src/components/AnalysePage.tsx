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
import { useSearchParams } from "react-router-dom";
import { Loader2, TriangleAlert, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import ResultsPage from "@/components/ResultsPage";
import ErrorBoundary from "@/components/ErrorBoundary";
import SkeletonResults from "@/components/SkeletonResults";
import UrlModal, { type UrlSuccess } from "@/components/UrlModal";
import OcrModal, { type OcrSuccess } from "@/components/OcrModal";
import HeroVerify from "@/components/HeroVerify";
import FactCheckCard from "@/components/FactCheckCard";
import ReliabilityCard from "@/components/ReliabilityCard";
import Footer from "@/components/Footer";
import { analyse, getFactChecks, ApiError } from "@/lib/api";
import type { AnalyseResult, FactCheckItem } from "@/lib/types";

export default function AnalysePage() {
  // ── Analysis state (unchanged contract) ─────────────────────
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [modal, setModal] = useState<null | "url" | "ocr">(null);
  const [showResults, setShowResults] = useState(false);
  const [runLime, setRunLime] = useState(false);
  // opt-in — keeps the default path within the ≤5s NFR
  const [runShap, setRunShap] = useState(false);
  const [announce, setAnnounce] = useState(""); // aria-live announcements
  const [expanded, setExpanded] = useState(false); // hero progressive disclosure

  // ── Fact-check feed state ───────────────────────────────────
  // Two lazy-loaded sections (Malaysia default / Foreign). A global navbar ?q=
  // search overrides the region and searches the whole corpus. Only the ACTIVE
  // section is fetched; a client cache means switching back never re-fetches.
  const [searchParams] = useSearchParams();
  const feedQuery = (searchParams.get("q") ?? "").trim();
  const searching = feedQuery.length > 0;
  const [region, setRegion] = useState<"malaysia" | "foreign">("malaysia");
  const [feedItems, setFeedItems] = useState<FactCheckItem[] | null>(null);
  const [feedError, setFeedError] = useState("");
  const feedCache = useRef<Record<string, FactCheckItem[]>>({});

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

  const handleUrlSuccess = ({ text: t, siteName, wordCount, label }: UrlSuccess) => {
    setText(t);
    if (siteName && !sourceName) setSourceName(siteName);
    setSuccessMsg(`Extracted ${wordCount} words from "${label}"`);
    setExpanded(true);
    setModal(null);
  };

  const handleOcrSuccess = ({ text: t, wordCount }: OcrSuccess) => {
    setText(t);
    setSuccessMsg(`Extracted ${wordCount} words from image`);
    setExpanded(true);
    setModal(null);
  };

  const handleAnalyse = useCallback(async () => {
    if (text.trim().length < 20) {
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
        text: text.trim(),
        source_name: sourceName.trim() || "Unknown Source",
        run_lime: runLime,
        run_shap: runShap,
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
  }, [text, sourceName, runLime, runShap]);

  const handleClear = () => {
    setText("");
    setSourceName("");
    setResult(null);
    setShowResults(false);
    setError("");
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
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
          successMsg={successMsg}
          expanded={expanded}
          setExpanded={setExpanded}
          onAnalyse={handleAnalyse}
          onClear={handleClear}
          onOpenUrl={() => setModal("url")}
          onOpenOcr={() => setModal("ocr")}
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Fact-check feed */}
          <section aria-labelledby="feed-heading">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  id="feed-heading"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Recently fact-checked
                </h2>
                <p className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">
                  {feedQuery
                    ? `Results for “${feedQuery}”`
                    : "Attributed claims by public figures"}
                </p>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Fact-checked statements attributed to a named speaker, drawn
                  from Google&rsquo;s ClaimReview corpus.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Source: Google Fact Check Tools · ClaimReview
              </p>
            </div>

            {!searching && (
              <div
                className="mt-4 inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm"
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

            <div className="mt-5">
              {feedError ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
                  <TriangleAlert className="h-4 w-4 text-warning" />
                  {feedError}
                </div>
              ) : feedItems === null ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading fact-checks…
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
                  {feedItems.map((item, i) => (
                    <FactCheckCard key={`${item.url}-${i}`} item={item} />
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

      <Footer />

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
