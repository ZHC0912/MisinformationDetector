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
      <section className="rounded-3xl bg-surface px-6 py-8 text-surface-foreground shadow-card sm:px-10 sm:py-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
            AI credibility engine
          </span>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl">
            Check any claim before you trust it.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-surface-foreground/60 sm:text-base">
            Paste an article link for an instant verdict, or drop in the full text
            below — MIDAS scores its credibility with a fine-tuned NLP model and
            cross-checks it against real fact-checks.
          </p>
          <div
            className="mt-5 flex flex-wrap justify-center gap-2"
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
            className="mx-auto mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center"
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
              className="h-12 w-full rounded-full bg-brand px-7 text-base font-semibold text-brand-foreground hover:bg-brand-hover sm:w-auto"
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
        className="mt-6 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-card sm:p-8"
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
                className="w-full bg-brand text-brand-foreground hover:bg-brand-hover"
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
