// ============================================================
// RESULTS PAGE — MIDAS credibility report (Option A layout).
//
// Structure:
//   - Navy MIDAS verdict BAND (full-width): the verdict at full weight + score
//     ring + one-line explanation + source / FR5 rating. Left-aligned.
//   - Two columns (lg:grid-cols-[1fr_340px], mirrors /app main+sidebar):
//       MAIN  = NLP detail, summary-first paragraph strip, fact-check DETAIL
//               (claim, sources, explanation, the Gemini action), SHAP/LIME.
//       RAIL  = LEAN sticky recap that stays visible while scrolling: a COMPACT
//               verdict chip + credibility score + confidence + the fact-check
//               OUTCOME (incl. the "no records found" state) + the disclaimer.
//               Heavy bits (sources, Gemini button) live in MAIN so the rail
//               stays short enough to keep sticking; it also scrolls internally
//               (lg:max-h + overflow) if it ever overflows.
//
// Presentation only — props, state, and the /analyse contract are unchanged.
// Every field the old page showed is preserved.
// ============================================================

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  X,
  MinusCircle,
  HelpCircle,
  TriangleAlert,
  Sparkles,
  RefreshCw,
  Search,
  ChevronDown,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useRevealOnScroll, revealClass } from "@/hooks/useRevealOnScroll";
import { factCheckAi, ApiError } from "@/lib/api";
import type {
  AnalyseResult,
  FactCheck,
  InfluenceWord,
  Chunk,
  SourceRating,
} from "@/lib/types";

interface Props {
  result: AnalyseResult;
  submittedText: string;
  limeRequested?: boolean;
  shapRequested?: boolean;
  onBack: () => void;
  onClear: () => void;
}

// Paragraphs at or above this misleading probability are auto-expanded and
// flagged; the criterion is surfaced on screen so the rule is explicit.
const FLAG_THRESHOLD = 0.5;

// Fine-grain noise texture — the same treatment applied to the /app dark
// surfaces (HeroVerify band, ReliabilityCard). Data-URI, no asset dependency.
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

// Shared verdict styling (icon + tones). One source of truth for band + chip.
const VERDICT_META: Record<
  string,
  {
    Icon: typeof Check;
    accent: string; // text tone on the navy band
    chip: "success" | "destructive" | "warning";
  }
> = {
  Reliable: { Icon: Check, accent: "text-success", chip: "success" },
  Misleading: { Icon: X, accent: "text-destructive", chip: "destructive" },
  "Partially Reliable": {
    Icon: MinusCircle,
    accent: "text-warning",
    chip: "warning",
  },
};
const verdictMeta = (v: string) => VERDICT_META[v] || VERDICT_META["Partially Reliable"];
const scoreTone = (s: number) =>
  s >= 70 ? "success" : s >= 40 ? "warning" : "destructive";

// ── LIME/SHAP text highlighting ───────────────────────────────
function buildTokens(text: string, data: InfluenceWord[]) {
  const map = new Map<string, InfluenceWord>();
  for (const item of data) map.set(item.word.toLowerCase(), item);
  const tokens: { text: string; hit: InfluenceWord | null }[] = [];
  const re = /([A-Za-z0-9']+|[^A-Za-z0-9']+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[1];
    const key = tok.toLowerCase().replace(/[^a-z0-9]/g, "");
    tokens.push({ text: tok, hit: map.get(key) || null });
  }
  return tokens;
}

function HighlightedText({
  text,
  data,
  requested,
}: {
  text: string;
  data?: InfluenceWord[];
  requested: boolean;
}) {
  if (!data?.length) {
    const note = requested
      ? "(Highlighting unavailable — model not loaded)"
      : "(Word analysis not requested — enable it on the input page and re-analyse)";
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
        <span className="mr-1 text-xs italic text-muted-foreground">{note}</span>
        {text}
      </div>
    );
  }
  const tokens = buildTokens(text, data);
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
      {tokens.map((tok, i) => {
        if (!tok.hit) return <span key={i}>{tok.text}</span>;
        const { direction, strength } = tok.hit;
        const alpha = Math.round((0.15 + strength * 0.45) * 100) / 100;
        const bg =
          direction === "misleading"
            ? `rgba(220,38,38,${alpha})`
            : `rgba(22,163,74,${alpha})`;
        return (
          <mark
            key={i}
            className="rounded px-0.5 text-foreground"
            style={{ background: bg }}
            title={`${direction} influence · ${(strength * 100).toFixed(0)}%`}
          >
            {tok.text}
          </mark>
        );
      })}
    </div>
  );
}

// ── Summary-first paragraph strip ─────────────────────────────
// Every paragraph is kept (nothing removed), but only FLAGGED paragraphs
// (misleading prob >= FLAG_THRESHOLD) auto-expand; reliable ones collapse to a
// one-line score row and expand on click. The flag criterion is shown up top.
function ParagraphAnalysis({ chunks }: { chunks: Chunk[] }) {
  const flaggedIdx = chunks
    .map((c, i) => (c.misleading_prob >= FLAG_THRESHOLD ? i : -1))
    .filter((i) => i >= 0);
  const [open, setOpen] = useState<Set<number>>(() => new Set(flaggedIdx));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <section aria-label="Paragraph-level analysis">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold tracking-tight">Paragraph-level analysis</h3>
        <span className="text-xs font-medium text-muted-foreground">
          {flaggedIdx.length} of {chunks.length} paragraph
          {chunks.length === 1 ? "" : "s"} flagged (≥{" "}
          {Math.round(FLAG_THRESHOLD * 100)}% misleading)
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Each paragraph is scored independently; the overall verdict is their
        average. Flagged paragraphs are expanded — click any row to expand or
        collapse it.
      </p>
      <div className="space-y-2">
        {chunks.map((c, i) => {
          const bad = c.misleading_prob >= FLAG_THRESHOLD;
          const isOpen = open.has(i);
          const pct = (c.misleading_prob * 100).toFixed(1);
          return (
            <div
              key={i}
              className={cn(
                "overflow-hidden rounded-lg border border-l-2",
                bad ? "border-l-destructive bg-destructive-muted/30" : "border-l-success"
              )}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
              >
                <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">
                  ¶ {i + 1}
                </span>
                <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                  <div
                    className={cn("h-full rounded-full", bad ? "bg-destructive" : "bg-success")}
                    style={{ width: `${c.misleading_prob * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    bad ? "text-destructive" : "text-success"
                  )}
                >
                  {pct}% misleading
                </span>
                <Badge variant={bad ? "destructive" : "success"} className="shrink-0">
                  {bad ? <X /> : <Check />} {c.verdict}
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && (
                <p className="border-t px-3 py-2.5 text-sm leading-relaxed">{c.text}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Score ring (works on light card OR the dark navy band) ────
function ScoreRing({ score, onDark = false }: { score: number; onDark?: boolean }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const toneClass =
    score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-destructive";
  return (
    <div
      className="flex flex-col items-center gap-1"
      role="img"
      aria-label={`Credibility score ${score} out of 100`}
    >
      <svg className={toneClass} width="112" height="112" viewBox="0 0 114 114">
        <circle
          className={onDark ? "text-white" : "text-muted"}
          cx="57"
          cy="57"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          opacity={onDark ? 0.18 : 0.35}
        />
        <circle
          cx="57"
          cy="57"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
          strokeLinecap="round"
          transform="rotate(-90 57 57)"
        />
        <text
          x="57"
          y="54"
          textAnchor="middle"
          className={onDark ? "fill-white" : "fill-foreground"}
          fontSize="26"
          fontWeight="700"
        >
          {score}
        </text>
        <text
          x="57"
          y="72"
          textAnchor="middle"
          className={onDark ? "fill-white/60" : "fill-muted-foreground"}
          fontSize="12"
        >
          /100
        </text>
      </svg>
      <div
        className={cn(
          "text-xs font-medium",
          onDark ? "text-surface-foreground/60" : "text-muted-foreground"
        )}
      >
        Credibility
      </div>
    </div>
  );
}

// ── Compact credibility readout (sticky rail — not another ring) ──
function RailScore({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">Credibility</span>
        <span className="text-sm text-muted-foreground">
          <b
            className={cn(
              "text-lg",
              tone === "success"
                ? "text-success"
                : tone === "warning"
                  ? "text-warning"
                  : "text-destructive"
            )}
          >
            {score}
          </b>
          /100
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "success"
              ? "bg-success"
              : tone === "warning"
                ? "bg-warning"
                : "bg-destructive"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ── Confidence bar ────────────────────────────────────────────
function ConfBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad";
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="font-medium text-muted-foreground">
          {(value * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "good" ? "bg-success" : "bg-destructive"
          )}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Fact-check verdict badge ──────────────────────────────────
function FCBadge({ verdict }: { verdict: string }) {
  const map: Record<
    string,
    { variant: "success" | "destructive" | "warning" | "secondary"; Icon: typeof Check }
  > = {
    TRUE: { variant: "success", Icon: Check },
    FALSE: { variant: "destructive", Icon: X },
    "PARTIALLY TRUE": { variant: "warning", Icon: MinusCircle },
    UNVERIFIABLE: { variant: "secondary", Icon: HelpCircle },
  };
  const { variant, Icon } = map[verdict] || map.UNVERIFIABLE;
  return (
    <Badge variant={variant}>
      <Icon /> {verdict}
    </Badge>
  );
}

// ── Compact verdict chip (sticky rail — NOT a second verdict block) ──
function VerdictChip({ verdict }: { verdict: string }) {
  const { Icon, chip } = verdictMeta(verdict);
  return (
    <Badge variant={chip} className="text-sm">
      <Icon /> {verdict}
    </Badge>
  );
}

// ── Navy verdict band — the verdict at full weight ────────────
function VerdictBand({
  verdict,
  explanation,
  score,
  sourceName,
  rating,
}: {
  verdict: string;
  explanation: string;
  score: number;
  sourceName?: string;
  rating?: SourceRating | null;
}) {
  const { Icon, accent } = verdictMeta(verdict);
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-surface px-6 py-9 text-surface-foreground shadow-card sm:px-10 sm:py-11"
      aria-label={`Final verdict: ${verdict}`}
    >
      {/* Atmosphere — soft orange glow + fine grain, same recipe as the /app
          hero band. Layers sit BEHIND the z-10 content, so the verdict word and
          score ring keep full contrast. */}
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
      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
            Credibility analysis report
          </span>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5",
                accent
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={2.5} />
            </span>
            <h1
              className={cn(
                "font-display text-4xl font-extrabold leading-none tracking-[-0.02em] sm:text-5xl",
                accent
              )}
            >
              {verdict}
            </h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-surface-foreground/70 sm:text-base">
            {explanation}
          </p>
          {sourceName && sourceName !== "Unknown Source" && (
            <div className="mt-2 text-sm text-surface-foreground/60">
              Source:{" "}
              <strong className="text-surface-foreground">{sourceName}</strong>
            </div>
          )}
          <SourceRatingBadge rating={rating} onDark />
        </div>
        <div className="shrink-0 self-center">
          <ScoreRing score={score} onDark />
        </div>
      </div>
    </section>
  );
}

// ── Source reliability rating (FR5) ───────────────────────────
function SourceRatingBadge({
  rating,
  onDark = false,
}: {
  rating?: SourceRating | null;
  onDark?: boolean;
}) {
  if (!rating) return null;
  const dim = onDark ? "text-surface-foreground/60" : "text-muted-foreground";
  const tone =
    rating.tier_index == null
      ? "secondary"
      : rating.tier_index >= 4
        ? "success"
        : rating.tier_index >= 2
          ? "warning"
          : "destructive";
  const hist = rating.history;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={dim}>Source reliability:</span>
        <Badge variant={tone as "success" | "warning" | "destructive" | "secondary"}>
          {rating.rating}
        </Badge>
        {rating.bias && rating.bias !== "Unknown" && (
          <span className={cn("text-xs", dim)}>· {rating.bias}</span>
        )}
        {rating.category && <span className={cn("text-xs", dim)}>· {rating.category}</span>}
      </div>
      {rating.basis === "history" && hist && (
        <div className={cn("mt-1 text-xs", dim)}>
          Derived from {hist.count} analyses in this system (avg credibility{" "}
          {hist.avg_credibility}/100)
        </div>
      )}
      {rating.basis === "seed+history" && hist && (
        <div className={cn("mt-1 text-xs", dim)}>
          Baseline {rating.seed_rating}, adjusted over {hist.count} analyses (avg
          credibility {hist.avg_credibility}/100)
        </div>
      )}
    </div>
  );
}

// ── Word-influence bars (shared by LIME + SHAP) ───────────────
function InfluenceChart({
  items,
  open,
  onToggle,
}: {
  items: InfluenceWord[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 px-2 text-muted-foreground"
        aria-expanded={open}
        onClick={onToggle}
      >
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        {open ? "Hide top influencing words" : "Show top influencing words"}
      </Button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate font-medium">{item.word}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    item.direction === "misleading" ? "bg-destructive" : "bg-success"
                  )}
                  style={{ width: `${Math.round(item.strength * 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-9 shrink-0 text-right font-medium",
                  item.direction === "misleading" ? "text-destructive" : "text-success"
                )}
              >
                {Math.round(item.strength * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function InfluenceLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Misleading
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-success" /> Reliable
      </span>
    </div>
  );
}

// ── Persistent disclaimer (ethics point — always visible in the rail) ──
function Disclaimer() {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
      <strong className="text-foreground">Disclaimer:</strong> AI analysis is
      indicative only and may not be accurate. It is not a substitute for
      professional fact-checking or independent verification.
    </div>
  );
}

// ── Reveal-on-scroll report card (presentation only) ──────────
// Light report card that reveals as it scrolls in (shared hook) with a subtle
// per-card stagger + hover lift — the same treatment as /app FactCheckCard.
// Dark-band glow/grain is NOT used here: light reading cards stay clean.
function RevealCard({
  index = 0,
  className,
  children,
  ...rest
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <section
      ref={ref}
      style={{ transitionDelay: visible ? `${Math.min(index, 7) * 60}ms` : "0ms" }}
      className={cn(
        "rounded-3xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:transition-none",
        revealClass(visible),
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ResultsPage({
  result,
  submittedText,
  limeRequested = true,
  shapRequested = true,
  onBack,
}: Props) {
  const [displayFc, setDisplayFc] = useState<FactCheck>(result.fact_check);
  const [finalVerdict, setFinalVerdict] = useState(result.final_verdict);
  const [finalExplanation, setFinalExplanation] = useState(result.final_explanation);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [showLimeChart, setShowLimeChart] = useState(false);
  const [showShapChart, setShowShapChart] = useState(false);

  const handleAiCheck = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const data = await factCheckAi({
        text: submittedText,
        style_verdict: result.style_verdict,
        style_confidence: result.confidence,
      });
      setDisplayFc(data.fact_check);
      setFinalVerdict(data.final_verdict);
      setFinalExplanation(data.final_explanation);
    } catch (err) {
      setAiError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the backend. Make sure the server is running on port 8000."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const hasLime = (result.lime_explanation?.length ?? 0) > 0;
  const hasShap = (result.shap_explanation?.length ?? 0) > 0;
  const hasChunks = (result.chunks?.length ?? 0) > 0;
  const isNotFound = displayFc.fact_check_source === "not_found";
  const isError = displayFc.fact_check_source === "error";
  const isGemini = displayFc.fact_check_source === "gemini_llm";

  const fcSourceLabel =
    displayFc.fact_check_source === "google_fact_check_api"
      ? "Google Fact Check API"
      : displayFc.fact_check_source === "gemini_llm"
        ? "Gemini AI (user opt-in)"
        : displayFc.fact_check_source === "error"
          ? "Gemini AI (failed)"
          : "Google Fact Check API (no match)";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Navy verdict band — full weight verdict + score */}
      <VerdictBand
        verdict={finalVerdict}
        explanation={finalExplanation}
        score={result.credibility_score}
        sourceName={result.source_name}
        rating={result.source_rating}
      />

      {result.heuristic_mode && (
        <Alert variant="warning" className="mt-4">
          <TriangleAlert />
          <AlertDescription>
            <strong>Heuristic mode</strong> — DistilBERT model not loaded. NLP
            results are keyword-based estimates only, not AI predictions.
          </AlertDescription>
        </Alert>
      )}

      {/* Main + sticky rail */}
      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[1fr_340px] lg:items-start">
        {/* ── MAIN column ── */}
        <div className="min-w-0 space-y-6">
          {/* NLP qualitative detail */}
          <RevealCard index={0} aria-label="NLP style analysis">
            <div className="mb-3 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
              <Search className="h-4 w-4" /> NLP style analysis
            </div>
            {(result.key_features?.length ?? 0) > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Detected patterns
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.key_features!.map((f, i) => (
                    <Badge
                      key={i}
                      variant={f.type === "warning" ? "destructive" : "success"}
                    >
                      {f.type === "warning" ? <TriangleAlert /> : <Check />}
                      {f.word}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">{result.style_explanation}</p>
          </RevealCard>

          {/* Fact-check DETAIL (heavy parts live here, not in the rail) */}
          <RevealCard index={1} aria-label="Fact-check detail">
            <div className="mb-3 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
              <Check className="h-4 w-4" /> Fact-check detail
            </div>

            {isNotFound ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Search className="h-4 w-4" /> No human fact-check records found
                  for this claim.
                </div>
                {displayFc.claim_extracted && (
                  <div className="text-xs text-muted-foreground">
                    Searched: "<em>{displayFc.claim_extracted}</em>"
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  You can ask Gemini for an AI-generated assessment. This is not a
                  human fact-check — treat it as indicative only.
                </p>
                <Button
                  onClick={handleAiCheck}
                  disabled={aiLoading}
                  className="bg-brand text-brand-foreground hover:bg-brand-hover"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="animate-spin" /> Asking Gemini…
                    </>
                  ) : (
                    <>
                      <Sparkles /> Check with AI (Gemini)
                    </>
                  )}
                </Button>
                {aiError && (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertDescription>{aiError}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : isError ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <TriangleAlert className="h-4 w-4" /> AI fact-check failed.
                </div>
                <div className="text-sm text-muted-foreground">{displayFc.summary}</div>
                <Button
                  onClick={handleAiCheck}
                  disabled={aiLoading}
                  className="bg-brand text-brand-foreground hover:bg-brand-hover"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="animate-spin" /> Retrying…
                    </>
                  ) : (
                    <>
                      <RefreshCw /> Retry AI check
                    </>
                  )}
                </Button>
                {aiError && (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertDescription>{aiError}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {isGemini && (
                  <div className="flex items-center gap-1.5 text-xs text-warning">
                    <TriangleAlert className="h-3.5 w-3.5" /> AI-generated analysis
                    — not human-reviewed. Treat as indicative only.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {displayFc.fact_check_source === "google_fact_check_api" ? (
                    <Badge variant="success">
                      <Check /> Human-reviewed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Sparkles /> AI inference
                    </Badge>
                  )}
                  <FCBadge verdict={displayFc.verdict} />
                </div>
                {displayFc.claim_extracted && (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    <strong>Claim checked:</strong> {displayFc.claim_extracted}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">{displayFc.summary}</div>
                {(displayFc.sources?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      {displayFc.fact_check_source === "google_fact_check_api"
                        ? "Verified sources:"
                        : "Sources consulted:"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {displayFc.sources!.map((s, i) => {
                        const isUrl = s.includes("http");
                        const [label, url] = isUrl ? s.split(" — ") : [s, null];
                        return url ? (
                          <a
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs hover:bg-accent"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {label} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span
                            key={i}
                            className="rounded-md border bg-muted px-2 py-0.5 text-xs"
                          >
                            {s}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">{displayFc.explanation}</p>
              </div>
            )}
          </RevealCard>

          {/* Summary-first paragraph strip */}
          {hasChunks && (
            <RevealCard index={2}>
              <ParagraphAnalysis chunks={result.chunks!} />
            </RevealCard>
          )}

          {/* LIME word influence */}
          {submittedText && (limeRequested || hasLime) && (
            <RevealCard index={3} aria-label="Explainability — LIME">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold tracking-tight">Word influence — LIME</h3>
                {hasLime && <InfluenceLegend />}
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {hasLime
                  ? "Words are highlighted by their influence on the verdict. Hover a word for its influence strength."
                  : limeRequested
                    ? "Word highlighting is only available when the DistilBERT model is loaded."
                    : 'Word analysis was not requested. Enable "Word influence — LIME" on the input page and re-analyse.'}
              </p>
              <HighlightedText
                text={submittedText}
                data={result.lime_explanation}
                requested={limeRequested}
              />
              {hasLime && (
                <InfluenceChart
                  items={result.lime_explanation!}
                  open={showLimeChart}
                  onToggle={() => setShowLimeChart((v) => !v)}
                />
              )}
            </RevealCard>
          )}

          {/* SHAP word influence */}
          {submittedText && (shapRequested || hasShap) && (
            <RevealCard index={4} aria-label="Explainability — SHAP">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold tracking-tight">Word influence — SHAP</h3>
                {hasShap && <InfluenceLegend />}
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {hasShap
                  ? "SHAP attributes the verdict to each word using Shapley values from cooperative game theory. Hover a word for its influence strength."
                  : shapRequested
                    ? "SHAP highlighting is only available when the DistilBERT model is loaded."
                    : 'SHAP was not requested. Enable "Word influence — SHAP" on the input page and re-analyse.'}
              </p>
              <HighlightedText
                text={submittedText}
                data={result.shap_explanation}
                requested={shapRequested}
              />
              {hasShap && (
                <InfluenceChart
                  items={result.shap_explanation!}
                  open={showShapChart}
                  onToggle={() => setShowShapChart((v) => !v)}
                />
              )}
            </RevealCard>
          )}

          {/* Report meta (stays with the main-column content) */}
          <p className="text-xs text-muted-foreground">
            Processed in {result.processing_time}s · DistilBERT NLP + {fcSourceLabel}{" "}
            · Always verify with independent sources
          </p>
        </div>

        {/* ── LEAN sticky rail — stays visible while scrolling ── */}
        <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className="space-y-4 rounded-3xl border bg-card p-5 shadow-card">
            {/* Compact verdict chip + score (NOT a second verdict block) */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Verdict
              </span>
              <VerdictChip verdict={finalVerdict} />
            </div>

            <RailScore score={result.credibility_score} />

            {/* Confidence */}
            <div className="space-y-2 border-t pt-4">
              <ConfBar label="Reliable" value={result.reliable_prob} tone="good" />
              <ConfBar label="Misleading" value={result.misleading_prob} tone="bad" />
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="secondary">{result.mode}</Badge>
                <span className="text-xs text-muted-foreground">
                  {(result.confidence * 100).toFixed(1)}% confidence
                </span>
              </div>
            </div>

            {/* Fact-check OUTCOME only (detail is in the main column) */}
            <div className="space-y-2 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fact-check
              </div>
              {isNotFound ? (
                <p className="text-sm text-muted-foreground">
                  No human fact-check records found.
                </p>
              ) : isError ? (
                <p className="text-sm text-destructive">AI fact-check failed.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {displayFc.fact_check_source === "google_fact_check_api" ? (
                    <Badge variant="success">
                      <Check /> Human-reviewed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Sparkles /> AI inference
                    </Badge>
                  )}
                  <FCBadge verdict={displayFc.verdict} />
                </div>
              )}
            </div>

            {/* Disclaimer — persistently visible */}
            <div className="border-t pt-4">
              <Disclaimer />
            </div>
          </div>
        </aside>
      </div>

      {/* End of report → full-width divider + primary action, BELOW both
          columns (main and rail), so it never staggers beside the taller one. */}
      <div className="mt-12 border-t pt-8 sm:mt-14">
        <Button
          onClick={onBack}
          className="bg-brand text-brand-foreground transition-shadow hover:bg-brand-hover hover:shadow-[0_12px_34px_-10px_rgba(249,115,22,0.55)]"
        >
          <ArrowLeft /> Analyse another
        </Button>
      </div>
    </main>
  );
}
