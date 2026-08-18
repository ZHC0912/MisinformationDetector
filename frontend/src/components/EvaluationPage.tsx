// ============================================================
// EVALUATION PAGE
// Model evaluation metrics, confusion matrix, and ROC curve.
// Loads the persisted result instantly on mount; a re-run
// recomputes and overwrites it. Same API contract as before.
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useRevealOnScroll, revealClass } from "@/hooks/useRevealOnScroll";
import { getEvaluation, rerunEvaluation, ApiError } from "@/lib/api";
import type { EvaluationResult, RocPoint } from "@/lib/types";

// Fine-grain noise texture — same treatment as the /app hero + results band.
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

// ── Reveal-on-scroll card (presentation only) ─────────────────
// Same treatment as /app FactCheckCard and the ResultsPage cards: matched
// radius, soft shadow, reveal-on-scroll with a subtle per-card stagger, hover
// lift. Reuses the shared hook; static under prefers-reduced-motion. Replaces
// the shadcn Card wrapper used before (purely visual — no behaviour changes).
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
        "rounded-3xl border bg-card text-card-foreground shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:transition-none",
        revealClass(visible),
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

// ── Metric card ───────────────────────────────────────────────
function MetricCard({
  label,
  value,
  subtitle,
  size = "sm",
  className,
  index = 0,
}: {
  label: string;
  value: number;
  subtitle: string;
  size?: "sm" | "lg";
  className?: string;
  index?: number;
}) {
  const big = size === "lg";
  return (
    <RevealCard
      className={cn("flex flex-col justify-center p-4", big && "sm:p-6", className)}
      index={index}
    >
      {/* small orange accent so the metrics aren't plain white boxes */}
      <div className={cn("mb-3 h-1 rounded-full bg-brand/80", big ? "w-10" : "w-8")} />
      <div
        className={cn(
          "font-bold tabular-nums text-foreground",
          big ? "text-4xl sm:text-5xl" : "text-2xl"
        )}
      >
        {(value * 100).toFixed(1)}%
      </div>
      <div className={cn("mt-1 font-semibold", big ? "text-base" : "text-sm")}>
        {label}
      </div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </RevealCard>
  );
}

// ── Confusion matrix ──────────────────────────────────────────
function ConfusionMatrix({
  cm,
}: {
  cm: { tp: number; tn: number; fp: number; fn: number };
}) {
  const total = cm.tp + cm.tn + cm.fp + cm.fn;
  const Cell = ({
    n,
    label,
    good,
  }: {
    n: number;
    label: string;
    good: boolean;
  }) => (
    <div
      className={cn(
        "rounded-md border p-2 text-center",
        good ? "bg-success-muted" : "bg-destructive-muted"
      )}
    >
      <div className="text-xl font-bold tabular-nums">{n}</div>
      <div className="text-xs text-muted-foreground">
        {((n / total) * 100).toFixed(0)}%
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
    </div>
  );
  return (
    <RevealCard className="flex flex-col p-4" index={0}>
      <div className="mb-3 font-display text-lg font-bold tracking-tight">
        Confusion Matrix
      </div>
      {/* centre the grid vertically so any equal-height leftover becomes
          breathing room around a compact matrix, not taller cells */}
      <div className="flex flex-1 items-center">
        <div className="grid w-full grid-cols-[auto_1fr_1fr] gap-2 text-xs">
        <div />
        <div className="text-center font-medium text-muted-foreground">
          Pred. Reliable
        </div>
        <div className="text-center font-medium text-muted-foreground">
          Pred. Misleading
        </div>

        <div className="flex items-center font-medium text-muted-foreground">
          Reliable
        </div>
        <Cell n={cm.tn} label="True Neg." good />
        <Cell n={cm.fp} label="False Pos." good={false} />

        <div className="flex items-center font-medium text-muted-foreground">
          Misleading
        </div>
        <Cell n={cm.fn} label="False Neg." good={false} />
        <Cell n={cm.tp} label="True Pos." good />
        </div>
      </div>
    </RevealCard>
  );
}

// ── Per-class classification report ───────────────────────────
function ClassReport({
  perClass,
}: {
  perClass: EvaluationResult["per_class"];
}) {
  const rows = [
    { name: "Reliable", cls: perClass.reliable, tone: "bg-success" },
    { name: "Misleading", cls: perClass.misleading, tone: "bg-destructive" },
  ];
  return (
    <RevealCard className="p-4" index={0}>
      <div className="mb-3 font-display text-lg font-bold tracking-tight">
        Classification Report
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Class</th>
              <th className="pb-2 font-medium">Precision</th>
              <th className="pb-2 font-medium">Recall</th>
              <th className="pb-2 font-medium">F1</th>
              <th className="pb-2 font-medium">Support</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, cls, tone }) => (
              <tr key={name} className="border-b last:border-0">
                <td className="py-2">
                  <span
                    className={cn(
                      "mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle",
                      tone
                    )}
                  />
                  {name}
                </td>
                <td className="py-2 tabular-nums">
                  {(cls.precision * 100).toFixed(1)}%
                </td>
                <td className="py-2 tabular-nums">
                  {(cls.recall * 100).toFixed(1)}%
                </td>
                <td className="py-2 font-semibold tabular-nums">
                  {(cls.f1 * 100).toFixed(1)}%
                </td>
                <td className="py-2 tabular-nums">{cls.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Precision = of all predicted positive, how many were correct.
        <br />
        Recall = of all actual positive, how many we caught.
        <br />
        F1 = harmonic mean of precision and recall.
      </div>
    </RevealCard>
  );
}

// ── ROC curve (SVG) ───────────────────────────────────────────
function RocCurve({ points, auc }: { points: RocPoint[]; auc: number }) {
  const W = 320;
  const H = 260;
  const PAD = 40;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const sorted = [...points].sort((a, b) => a.fpr - b.fpr);
  const toX = (fpr: number) => PAD + fpr * innerW;
  const toY = (tpr: number) => PAD + (1 - tpr) * innerH;
  const pathD = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.fpr).toFixed(1)} ${toY(p.tpr).toFixed(1)}`)
    .join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <RevealCard className="p-4" index={1}>
      <div className="mb-3 font-display text-lg font-bold tracking-tight">
        ROC Curve — AUC = {auc.toFixed(3)}
      </div>
      {/* Chart + explanation side by side (on lg+) so the paragraph no longer
          stacks UNDER the chart and inflates this card's height. max-w keeps the
          SVG — and its in-SVG label text, which scales with it — roughly square
          and ~225px tall, so this card lands close to the compact matrix card. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full max-w-[280px] shrink-0"
          role="img"
          aria-label={`ROC curve, area under curve ${auc.toFixed(3)}`}
        >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={toX(t)}
              y1={PAD}
              x2={toX(t)}
              y2={PAD + innerH}
              className="stroke-border"
              strokeWidth="1"
            />
            <line
              x1={PAD}
              y1={toY(t)}
              x2={PAD + innerW}
              y2={toY(t)}
              className="stroke-border"
              strokeWidth="1"
            />
          </g>
        ))}
        <line
          x1={toX(0)}
          y1={toY(0)}
          x2={toX(1)}
          y2={toY(1)}
          className="stroke-muted-foreground/40"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        <path
          d={pathD}
          fill="none"
          className="stroke-primary"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={PAD + innerH}
          className="stroke-muted-foreground"
          strokeWidth="1.5"
        />
        <line
          x1={PAD}
          y1={PAD + innerH}
          x2={PAD + innerW}
          y2={PAD + innerH}
          className="stroke-muted-foreground"
          strokeWidth="1.5"
        />
        {ticks.map((t) => (
          <text
            key={`x${t}`}
            x={toX(t)}
            y={PAD + innerH + 16}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {t.toFixed(2)}
          </text>
        ))}
        {ticks.map((t) => (
          <text
            key={`y${t}`}
            x={PAD - 7}
            y={toY(t) + 4}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {t.toFixed(2)}
          </text>
        ))}
        <text
          x={PAD + innerW / 2}
          y={H - 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="11"
        >
          False Positive Rate
        </text>
        <text
          x={12}
          y={PAD + innerH / 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="11"
          transform={`rotate(-90 12 ${PAD + innerH / 2})`}
        >
          True Positive Rate
        </text>
        </svg>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The ROC curve shows the trade-off between True Positive Rate
          (sensitivity) and False Positive Rate at every decision threshold. AUC
          = 1.0 is a perfect classifier; AUC = 0.5 is random. The dashed line
          represents a random baseline.
        </p>
      </div>
    </RevealCard>
  );
}

// ── Plain-language interpretation ─────────────────────────────
function Interpretation({ data }: { data: EvaluationResult }) {
  const cm = data.confusion_matrix;
  const auc = data.roc_auc;
  const aucLabel =
    auc >= 0.9
      ? "excellent"
      : auc >= 0.8
        ? "good"
        : auc >= 0.7
          ? "acceptable"
          : auc >= 0.6
            ? "weak"
            : "near-random";
  return (
    <RevealCard className="p-4" index={1}>
      <div className="mb-3 font-display text-lg font-bold tracking-tight">
        How to Read These Results
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>
          <strong className="text-foreground">
            {(data.accuracy * 100).toFixed(1)}% accuracy
          </strong>{" "}
          — {cm.tp + cm.tn} of {data.total_samples} statements classified
          correctly (random guessing on this balanced set would score ~50%).
        </li>
        <li>
          <strong className="text-foreground">AUC {auc.toFixed(3)}</strong> —{" "}
          <em>{aucLabel}</em> class separation: the model's ability to rank
          misleading statements above reliable ones across every possible
          threshold.
        </li>
        <li>
          <strong className="text-foreground">{cm.fp} false positives</strong> —
          reliable statements incorrectly flagged as misleading.
        </li>
        <li>
          <strong className="text-foreground">{cm.fn} false negatives</strong> —
          misleading statements the model failed to catch.
        </li>
        <li>
          <strong className="text-foreground">
            Threshold {data.threshold}
          </strong>{" "}
          — statements scoring above this P(misleading) cut-off are classed as
          misleading; tuned on the LIAR validation split.
        </li>
      </ul>
    </RevealCard>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function EvaluationPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false); // true only during a re-run
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  // On mount: load the most recent PERSISTED result instantly — no run needed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getEvaluation();
        if (!cancelled) setData(result); // null => empty state
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Cannot connect to backend.");
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rerunEval = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await rerunEvaluation();
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Cannot connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  const lastRun = data?.generated_at
    ? new Date(data.generated_at * 1000).toLocaleString()
    : null;

  return (
    <main className="w-full space-y-6 px-6 py-8 sm:px-8 sm:py-10">
        {/* MIDAS header band — dark navy with the same glow + grain recipe as
            the /app hero and the results verdict band. Title, LIAR description
            and the model-mode/threshold/last-run line live here; Re-run + Back
            sit top-right inside it. Everything below stays on the light bg. */}
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
                Model evaluation
              </span>
              <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                Model Evaluation Dashboard
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-surface-foreground/70">
                Evaluates the DistilBERT NLP classifier against the{" "}
                <strong className="text-surface-foreground">LIAR benchmark</strong>{" "}
                test split —{" "}
                <strong className="text-surface-foreground">
                  896 fact-checked political statements
                </strong>{" "}
                (448 Reliable, 448 Misleading) from PolitiFact (Wang, 2017).
                Computes standard binary classification metrics.
              </p>
              {data && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Model mode: {data.model_mode}</Badge>
                  <span className="text-xs text-surface-foreground/60">
                    {data.total_samples} samples · threshold = {data.threshold}
                    {lastRun && <> · last run {lastRun}</>}
                  </span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={rerunEval}
                disabled={loading || initialLoading}
                className="border-white/20 bg-white/5 text-surface-foreground hover:bg-white/10 hover:text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" /> Running…
                  </>
                ) : (
                  <>
                    <RefreshCw /> Re-run Evaluation
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/app")}
                className="border-white/20 bg-white/5 text-surface-foreground hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft /> Back
              </Button>
            </div>
          </div>
        </section>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Page-load state */}
        {initialLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading saved
            evaluation…
          </div>
        )}

        {/* Empty state */}
        {!initialLoading && !data && !error && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              No saved evaluation yet. Click <strong>Run Evaluation</strong> once
              to generate and persist the first result.
            </p>
            <Button onClick={rerunEval} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" /> Running evaluation…
                </>
              ) : (
                <>
                  <Play /> Run Evaluation
                </>
              )}
            </Button>
          </div>
        )}

        {/* Results */}
        {data && (
          <>
            {/* Primary metrics — larger, emphasised */}
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Accuracy" value={data.accuracy} subtitle="Overall correct" size="lg" index={0} />
              <MetricCard label="AUC-ROC" value={data.roc_auc} subtitle="Area under ROC curve" size="lg" index={1} />
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="Macro F1" value={data.macro_f1} subtitle="Harmonic mean" index={0} />
              <MetricCard label="Macro Precision" value={data.macro_precision} subtitle="Avg. precision" index={1} />
              <MetricCard label="Macro Recall" value={data.macro_recall} subtitle="Avg. recall" index={2} />
            </div>

            {/* Why four of the five metrics read almost the same value */}
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              On a perfectly balanced test set (448 Reliable / 448 Misleading),
              accuracy, macro-precision, macro-recall and macro-F1 all converge to
              nearly the same value — this closeness is expected on a balanced
              binary split, not a display error.
            </p>

            {/* Confusion matrix + ROC — the ROC chart is sized so the two cards
                are naturally close in height, then equal-height (stretch) lands
                them on the same line. Two columns only from lg (where the ROC
                chart + paragraph sit side by side); they stack below that. */}
            <div className="grid gap-5 lg:grid-cols-2">
              <ConfusionMatrix cm={data.confusion_matrix} />
              <RocCurve points={data.roc_curve} auc={data.roc_auc} />
            </div>

            {/* Classification report + interpretation — equal height (default
                grid stretch) so both cards end on the same line. */}
            <div className="grid gap-5 md:grid-cols-2">
              <ClassReport perClass={data.per_class} />
              <Interpretation data={data} />
            </div>
          </>
        )}

        {/* Methodology — full width so the lower section fills evenly */}
        <div className="rounded-2xl border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Methodology:</strong> The model is
          evaluated using the LIAR benchmark test split (Wang, 2017) — 896 short
          political claims from PolitiFact, balanced at 448 per class. Label
          mapping: pants-fire / false / barely-true → Misleading; mostly-true /
          true → Reliable; half-true excluded as ambiguous. This is an{" "}
          <strong className="text-foreground">out-of-domain</strong> evaluation:
          the model was trained on full news articles (ISOT dataset) and tested
          on short political claims, probing generalisation beyond the training
          distribution. Metrics are from the NLP classifier only.
        </div>
    </main>
  );
}
