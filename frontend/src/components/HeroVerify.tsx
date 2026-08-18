// ============================================================
// HERO VERIFY — a compact, CENTRED navy hero with a URL quick-lane pill, above
// the EXISTING analyse form (left-aligned, two-column, on the light page bg).
//
// Two independent entry points, ONE analysis path:
//   1. Quick lane (the centred pill): takes an ARTICLE LINK only. On submit it
//      fetches the article via the same scrapeUrl() the form's "Fetch from URL"
//      button uses (see AnalysePage.handleQuickVerify), fills the form state,
//      and runs the normal analyse flow with SHAP/LIME OFF (fast path). It does
//      NOT expand or reveal anything. Non-URL input shows an inline hint.
//   2. Manual form (below, on the light bg): source name + one textarea (short
//      headline OR full article) + URL/OCR import + SHAP/LIME + one submit.
//
// The pill keeps its OWN local `urlInput` state and never touches `text`, so the
// two lanes can't fight over the same state. This component is PRESENTATIONAL —
// all analysis state + handlers live in AnalysePage.
// ============================================================

import { useState } from "react";
import {
  Search,
  Link2,
  Image as ImageIcon,
  TriangleAlert,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useRevealOnScroll, revealClass } from "@/hooks/useRevealOnScroll";

// Fine-grain noise texture — the same treatment the landing page uses on its
// dark atmosphere. Kept as a data-URI so there's no asset dependency.
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

export interface HeroVerifyProps {
  text: string;
  setText: (v: string) => void;
  sourceName: string;
  setSourceName: (v: string) => void;
  runLime: boolean;
  setRunLime: (v: boolean) => void;
  runShap: boolean;
  setRunShap: (v: boolean) => void;
  wordCount: number;
  loading: boolean;
  error: string;
  quickError: string;
  successMsg: string;
  onQuickVerify: (url: string) => void;
  onAnalyse: () => void;
  onClear: () => void;
  onOpenUrl: () => void;
  onOpenOcr: () => void;
}

const CAPABILITIES = [
  "DistilBERT NLP",
  "Hybrid fact-check",
  "Image OCR",
  "URL import",
];

export default function HeroVerify(props: HeroVerifyProps) {
  const {
    text,
    setText,
    sourceName,
    setSourceName,
    runLime,
    setRunLime,
    runShap,
    setRunShap,
    wordCount,
    loading,
    error,
    quickError,
    successMsg,
    onQuickVerify,
    onAnalyse,
    onClear,
    onOpenUrl,
    onOpenOcr,
  } = props;

  // The pill's own state — a URL, kept separate from the analysed `text`.
  const [urlInput, setUrlInput] = useState("");

  // Presentation-only: staggered entrance for the hero (reuses the landing's
  // reveal hook; reveals instantly under prefers-reduced-motion).
  const { ref: heroRef, visible } = useRevealOnScroll<HTMLDivElement>();
  const rise = (ms: number) => ({ transitionDelay: visible ? `${ms}ms` : "0ms" });

  const submitQuick = (e: React.FormEvent) => {
    e.preventDefault();
    onQuickVerify(urlInput);
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    onAnalyse();
  };

  return (
    <>
      {/* ── Compact, CENTRED hero band with the URL quick-lane ── */}
      <section className="relative overflow-hidden rounded-3xl bg-surface px-6 py-10 text-surface-foreground shadow-card sm:px-10 sm:py-14">
        {/* Atmosphere — soft orange glow + fine grain, lifted from the landing.
            Low opacity so text contrast on the navy is unaffected. */}
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

        <div ref={heroRef} className="relative z-10 mx-auto max-w-3xl text-center">
          <span
            className={cn(
              "inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand",
              revealClass(visible)
            )}
            style={rise(0)}
          >
            AI credibility engine
          </span>
          <h1
            className={cn(
              "mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-5xl",
              revealClass(visible)
            )}
            style={rise(70)}
          >
            Check any claim before you trust it.
          </h1>
          <p
            className={cn(
              "mx-auto mt-4 max-w-xl text-sm leading-relaxed text-surface-foreground/60 sm:text-base",
              revealClass(visible)
            )}
            style={rise(140)}
          >
            Paste an article link for an instant verdict, or drop in the full text
            below — MIDAS scores its credibility with a fine-tuned NLP model and
            cross-checks it against real fact-checks.
          </p>
          <div
            className={cn(
              "mt-6 flex flex-wrap justify-center gap-2",
              revealClass(visible)
            )}
            style={rise(210)}
            aria-label="System capabilities"
          >
            {CAPABILITIES.map((c) => (
              <span
                key={c}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-surface-foreground/70"
              >
                {c}
              </span>
            ))}
          </div>

          {/* URL quick-lane pill (does NOT expand a form) */}
          <form
            role="search"
            onSubmit={submitQuick}
            className={cn(
              "mx-auto mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center",
              revealClass(visible)
            )}
            style={rise(280)}
          >
            <div className="relative flex-1">
              <Link2
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                inputMode="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste an article link to verify instantly…"
                aria-label="Paste an article link to verify instantly"
                aria-invalid={quickError ? true : undefined}
                className={cn(
                  "h-12 w-full rounded-full border border-transparent bg-white pl-11 pr-4 text-sm text-foreground shadow-sm",
                  "placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
                )}
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-full bg-brand px-7 text-base font-semibold text-brand-foreground transition-shadow hover:bg-brand-hover hover:shadow-[0_12px_34px_-10px_rgba(249,115,22,0.65)] sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" /> Verifying…
                </>
              ) : (
                "Verify Now"
              )}
            </Button>
          </form>

          {quickError && (
            <Alert
              variant="destructive"
              className="mx-auto mt-3 max-w-2xl text-left"
            >
              <TriangleAlert />
              <AlertDescription>{quickError}</AlertDescription>
            </Alert>
          )}
        </div>
      </section>

      {/* ── Manual analyse form on the LIGHT page background (unchanged block) ── */}
      <form
        onSubmit={submitForm}
        className="mt-8 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-card sm:p-8"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* LEFT — the single input */}
          <div>
            <div className="space-y-1.5">
              <Label htmlFor="source-input">
                Source name{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="source-input"
                placeholder="e.g. BBC News, @politician, Ministry of Health"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
              />
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="text-input">Headline or article text</Label>
                {wordCount > 0 && (
                  <span className="text-xs text-muted-foreground">{wordCount} words</span>
                )}
              </div>
              <Textarea
                id="text-input"
                className="min-h-44 lg:min-h-56"
                placeholder="Paste a short headline, a single claim, or a full article — MIDAS handles any length. You can also import the text from a URL or an image using the tools on the right."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            {successMsg && (
              <Alert variant="success" className="mt-4">
                <Check />
                <AlertDescription>{successMsg}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mt-4">
                <TriangleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* RIGHT — rail: imports, explainability, one submit */}
          <div className="flex flex-col gap-5 lg:border-l lg:border-border lg:pl-6">
            <div className="space-y-2">
              <div className="text-sm font-medium">Import text</div>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={onOpenUrl}
              >
                <Link2 /> Fetch from URL
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={onOpenOcr}
              >
                <ImageIcon /> Extract from image
              </Button>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Explainability</div>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  checked={runShap}
                  onCheckedChange={(v) => setRunShap(v === true)}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">Word influence — SHAP</span>
                  <span className="text-xs text-muted-foreground">
                    Scores how much each word affected the verdict · slower, ~10–45s
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  checked={runLime}
                  onCheckedChange={(v) => setRunLime(v === true)}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">Word influence — LIME</span>
                  <span className="text-xs text-muted-foreground">
                    Highlights which words drove the verdict · adds ~5–10s
                  </span>
                </span>
              </label>
            </div>

            {/* Single submit, anchored to the bottom of the rail */}
            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-brand text-brand-foreground transition-shadow hover:bg-brand-hover hover:shadow-[0_12px_34px_-10px_rgba(249,115,22,0.55)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" /> Analysing…
                  </>
                ) : (
                  <>
                    <Search /> Analyse credibility
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
