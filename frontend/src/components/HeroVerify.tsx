// ============================================================
// HERO VERIFY — dark hero card with a progressively-disclosed entry to the
// EXISTING analyse form. Collapsed: one pill input + "Verify Now". On focus or
// click it expands (animated) to reveal the full form the tool already had:
// source name, article textarea, URL/OCR import, and LIME/SHAP options.
//
// This component is PRESENTATIONAL: all state + handleAnalyse live in
// AnalysePage and are passed in, so the analysis flow is unchanged — the pill
// and the textarea both bind to the same `text` state.
// ============================================================

import {
  Search,
  Link2,
  Image as ImageIcon,
  TriangleAlert,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  successMsg: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onAnalyse: () => void;
  onClear: () => void;
  onOpenUrl: () => void;
  onOpenOcr: () => void;
}

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
    successMsg,
    expanded,
    setExpanded,
    onAnalyse,
    onClear,
    onOpenUrl,
    onOpenOcr,
  } = props;

  // Pill submit: always reveal the form (so validation errors are visible) then
  // run the existing analyse flow.
  const submitPill = (e: React.FormEvent) => {
    e.preventDefault();
    setExpanded(true);
    onAnalyse();
  };

  return (
    <section className="rounded-3xl bg-surface px-5 py-8 text-surface-foreground shadow-card sm:px-10 sm:py-12">
      <div className="mx-auto max-w-3xl text-center">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
          AI credibility engine
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          Check any claim before you trust it.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-surface-foreground/60 sm:text-base">
          Paste a headline, article, or social post — MIDAS scores its
          credibility with a fine-tuned NLP model and cross-checks it against
          real fact-checks.
        </p>
      </div>

      {/* Collapsed pill */}
      <form
        role="search"
        onSubmit={submitPill}
        className="mx-auto mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setExpanded(true)}
            onClick={() => setExpanded(true)}
            placeholder="Enter a headline or claim to verify…"
            aria-label="Enter a headline or claim to verify"
            aria-expanded={expanded}
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
              <Loader2 className="animate-spin" /> Analysing…
            </>
          ) : (
            "Verify Now"
          )}
        </Button>
      </form>

      {/* Expandable full form (animated height via grid-rows) */}
      <div
        className={cn(
          "mx-auto grid max-w-2xl transition-all duration-300 ease-out",
          expanded ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden" inert={expanded ? undefined : true}>
          <div className="rounded-2xl bg-card p-5 text-left text-card-foreground shadow-sm">
            {/* Capability chips */}
            <div className="flex flex-wrap gap-2" aria-label="System capabilities">
              <Badge variant="secondary">DistilBERT NLP</Badge>
              <Badge variant="secondary">Hybrid fact-check</Badge>
              <Badge variant="secondary">Image OCR</Badge>
              <Badge variant="secondary">URL import</Badge>
            </div>

            {/* Source name */}
            <div className="mt-4 space-y-1.5">
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

            {/* Article text */}
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="text-input">Article / post text</Label>
                {wordCount > 0 && (
                  <span className="text-xs text-muted-foreground">{wordCount} words</span>
                )}
              </div>
              <Textarea
                id="text-input"
                className="min-h-36"
                placeholder="Paste the full article or post text here — or import it from a URL or an image below."
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

            {/* Import tools */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={onOpenUrl}>
                <Link2 /> Fetch from URL
              </Button>
              <Button variant="outline" onClick={onOpenOcr}>
                <ImageIcon /> Extract from image
              </Button>
            </div>

            {/* Explainability options */}
            <div className="mt-5 space-y-3 border-t pt-5">
              <div className="text-sm font-medium">Explainability options</div>
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

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-5">
              <Button
                onClick={onAnalyse}
                disabled={loading}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
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
              <Button variant="outline" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
