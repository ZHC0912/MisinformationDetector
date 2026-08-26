// ============================================================
// EVALUATION PAGE
// Professional model-evaluation dashboard.
// Behaviour/API contract is unchanged; this file only redesigns
// the presentation and information hierarchy.
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Database,
  FlaskConical,
  Gauge,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useRevealOnScroll, revealClass } from "@/hooks/useRevealOnScroll";
import { getEvaluation, rerunEvaluation, ApiError } from "@/lib/api";
import type { EvaluationResult, RocPoint } from "@/lib/types";

const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

// ── Seed-variance reproducibility summary (presentation only) ─
// Static figures from backend/liar_seed_variance.json, produced by
// notebooks/05_seed_variance.ipynb at commit 413493a. They describe a SEPARATE
// reproducibility study — the identical stage-2 pipeline re-run under 3 fixed
// seeds — NOT the deployed model and NOT the live metrics this page fetches. So
// they are a fixed constant here, never read from the evaluation API. Rounded to
// 3 dp from the JSON summary (macro_f1 0.6558±0.0113, roc_auc 0.7311±0.0046).
const SEED_VARIANCE = {
  seeds: [42, 1, 7],
  n: 3,
  macroF1: { mean: 0.656, std: 0.011 },
  auc: { mean: 0.731, std: 0.005 },
};

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

function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  index = 0,
  featured = false,
  icon: Icon,
}: {
  label: string;
  value: number;
  subtitle: string;
  index?: number;
  featured?: boolean;
  icon: React.ElementType;
}) {
  return (
    <RevealCard
      index={index}
      className={cn(
        "relative overflow-hidden p-5",
        featured && "border-brand/30 bg-gradient-to-br from-card via-card to-brand/5"
      )}
    >
      <div className="absolute right-4 top-4 rounded-xl bg-brand/10 p-2 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mb-3 h-1 w-9 rounded-full bg-brand/80" />
      <div className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
        {(value * 100).toFixed(1)}%
      </div>
      <div className="mt-2 font-semibold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
    </RevealCard>
  );
}

function MiniMetric({ label, value, subtitle, index }: { label: string; value: number; subtitle: string; index: number }) {
  return (
    <RevealCard index={index} className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{(value * 100).toFixed(1)}%</div>
        </div>
        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{subtitle}</div>
    </RevealCard>
  );
}

function ConfusionMatrix({ cm }: { cm: { tp: number; tn: number; fp: number; fn: number } }) {
  const total = cm.tp + cm.tn + cm.fp + cm.fn;
  const Cell = ({ n, label, tone }: { n: number; label: string; tone: "good" | "bad" }) => (
    <div
      className={cn(
        // Tighter padding + smaller number so each block hugs its content
        // (keeps the height close to the Classification Report beside it).
        "rounded-xl border p-2.5 text-center",
        // Semantic tokens (--success / --destructive) instead of raw palette
        // shades, matching the rest of the app.
        tone === "good"
          ? "border-success/30 bg-success-muted"
          : "border-destructive/30 bg-destructive-muted"
      )}
    >
      <div className="text-xl font-bold tabular-nums">{n}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{((n / total) * 100).toFixed(1)}%</div>
    </div>
  );

  return (
    <RevealCard className="p-5" index={0}>
      <SectionHeading
        eyebrow="Error analysis"
        title="Confusion Matrix"
        description="Breakdown of correct and incorrect predictions across both classes."
        icon={Target}
      />

      <div className="overflow-x-auto">
        <div className="mx-auto grid min-w-[440px] max-w-xl grid-cols-[120px_1fr_1fr] gap-2 text-xs">
          <div />
          <div className="rounded-xl bg-muted/60 px-2 py-2 text-center font-semibold text-muted-foreground">Pred. Reliable</div>
          <div className="rounded-xl bg-muted/60 px-2 py-2 text-center font-semibold text-muted-foreground">Pred. Misleading</div>

          <div className="flex items-center px-2 font-semibold text-muted-foreground">Actual Reliable</div>
          <Cell n={cm.tn} label="True Negative" tone="good" />
          <Cell n={cm.fp} label="False Positive" tone="bad" />

          <div className="flex items-center px-2 font-semibold text-muted-foreground">Actual Misleading</div>
          <Cell n={cm.fn} label="False Negative" tone="bad" />
          <Cell n={cm.tp} label="True Positive" tone="good" />
        </div>
      </div>

      {/* Compact TP/TN/FP/FN summary — tighter pills + smaller divider gap than
          before, so it doesn't reintroduce the height problem; stays one line
          across the card at desktop width. */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
        <StatPill icon={CheckCircle2} label="TP" value={cm.tp} />
        <StatPill icon={CheckCircle2} label="TN" value={cm.tn} />
        <StatPill icon={XCircle} label="FP" value={cm.fp} />
        <StatPill icon={XCircle} label="FN" value={cm.fn} />
      </div>
    </RevealCard>
  );
}

function StatPill({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 text-brand" />
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ClassReport({ perClass }: { perClass: EvaluationResult["per_class"] }) {
  const rows = [
    { name: "Reliable", cls: perClass.reliable, tone: "bg-success" },
    { name: "Misleading", cls: perClass.misleading, tone: "bg-destructive" },
  ];

  return (
    <RevealCard className="p-5" index={1}>
      <SectionHeading
        eyebrow="Per-class performance"
        title="Classification Report"
        description="Precision, recall, F1 score and support for each target class."
        icon={BarChart3}
      />
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Class</th>
              <th className="px-4 py-3 font-semibold">Precision</th>
              <th className="px-4 py-3 font-semibold">Recall</th>
              <th className="px-4 py-3 font-semibold">F1</th>
              <th className="px-4 py-3 text-right font-semibold">Support</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, cls, tone }) => (
              <tr key={name} className="border-t">
                <td className="px-4 py-3 font-medium">
                  <span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-full", tone)} />
                  {name}
                </td>
                <td className="px-4 py-3 tabular-nums">{(cls.precision * 100).toFixed(1)}%</td>
                <td className="px-4 py-3 tabular-nums">{(cls.recall * 100).toFixed(1)}%</td>
                <td className="px-4 py-3 font-semibold tabular-nums">{(cls.f1 * 100).toFixed(1)}%</td>
                <td className="px-4 py-3 text-right tabular-nums">{cls.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* One sentence per line via separate block elements (not <br>) so the
          line spacing matches the rest of the page. */}
      <div className="mt-4 space-y-2 rounded-2xl bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <div>
          <strong className="text-foreground">Precision</strong> measures how many predicted positives were correct.
        </div>
        <div>
          <strong className="text-foreground">Recall</strong> measures how many actual positives were detected.
        </div>
        <div>
          <strong className="text-foreground">F1</strong> balances precision and recall.
        </div>
        <div>
          <strong className="text-foreground">Support</strong> is the number of test statements that actually belong to that class.
        </div>
      </div>
    </RevealCard>
  );
}

function RocCurve({ points, auc }: { points: RocPoint[]; auc: number }) {
  const W = 360;
  const H = 270;
  const PAD = 42;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const sorted = [...points].sort((a, b) => a.fpr - b.fpr);
  const toX = (fpr: number) => PAD + fpr * innerW;
  const toY = (tpr: number) => PAD + (1 - tpr) * innerH;
  const pathD = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.fpr).toFixed(1)} ${toY(p.tpr).toFixed(1)}`)
    .join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <RevealCard className="p-5" index={0}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          eyebrow="Threshold analysis"
          title="ROC Curve"
          description="Model discrimination across every decision threshold."
          icon={TrendingUp}
        />
        <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">AUC</div>
          <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{auc.toFixed(3)}</div>
        </div>
      </div>

      {/* Single-column: the chart spans the card (centred, capped so its 4:3
          viewBox stays proportional and doesn't letterbox), a one-line caption
          under it, then the legend. -mt-3 tightens the gap left by
          SectionHeading's shared mb-5 — ROC card only, others keep their spacing. */}
      <div className="-mt-10">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-[560px]" role="img" aria-label={`ROC curve, area under curve ${auc.toFixed(3)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={toX(t)} y1={PAD} x2={toX(t)} y2={PAD + innerH} className="stroke-border" strokeWidth="1" />
              <line x1={PAD} y1={toY(t)} x2={PAD + innerW} y2={toY(t)} className="stroke-border" strokeWidth="1" />
            </g>
          ))}
          <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} className="stroke-muted-foreground/35" strokeWidth="1.5" strokeDasharray="6 4" />
          <path d={pathD} fill="none" className="stroke-primary" strokeWidth="3" strokeLinejoin="round" />
          <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + innerH} className="stroke-muted-foreground" strokeWidth="1.5" />
          <line x1={PAD} y1={PAD + innerH} x2={PAD + innerW} y2={PAD + innerH} className="stroke-muted-foreground" strokeWidth="1.5" />
          {ticks.map((t) => (
            <text key={`x${t}`} x={toX(t)} y={PAD + innerH + 16} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
              {t.toFixed(2)}
            </text>
          ))}
          {ticks.map((t) => (
            <text key={`y${t}`} x={PAD - 7} y={toY(t) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="10">
              {t.toFixed(2)}
            </text>
          ))}
          <text x={PAD + innerW / 2} y={H - 2} textAnchor="middle" className="fill-muted-foreground" fontSize="11">False Positive Rate</text>
          <text x={12} y={PAD + innerH / 2} textAnchor="middle" className="fill-muted-foreground" fontSize="11" transform={`rotate(-90 12 ${PAD + innerH / 2})`}>True Positive Rate</text>
        </svg>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          AUC measures how well the model separates misleading from reliable statements across all thresholds; closer to 1.0 is stronger.
        </p>

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-0.5 w-7 bg-primary" /> Model curve
          <span className="ml-3 inline-block h-0.5 w-7 border-t border-dashed border-muted-foreground/50" /> Random baseline
        </div>
      </div>
    </RevealCard>
  );
}

function Interpretation({ data }: { data: EvaluationResult }) {
  const cm = data.confusion_matrix;
  const auc = data.roc_auc;
  const aucLabel = auc >= 0.9 ? "Excellent" : auc >= 0.8 ? "Good" : auc >= 0.7 ? "Acceptable" : auc >= 0.6 ? "Weak" : "Near-random";

  const items = [
    {
      term: `${(data.accuracy * 100).toFixed(1)}% accuracy`,
      // Keep the random-baseline note from the previous page.
      detail: `${cm.tp + cm.tn} of ${data.total_samples} statements were classified correctly (random guessing on this balanced set would score ~50%).`,
      icon: Gauge,
    },
    {
      term: `AUC ${auc.toFixed(3)}`,
      detail: `${aucLabel} class separation across decision thresholds.`,
      icon: TrendingUp,
    },
    {
      term: `${cm.fp} false positives`,
      detail: "Reliable statements incorrectly flagged as misleading.",
      icon: CircleAlert,
    },
    {
      term: `${cm.fn} false negatives`,
      detail: "Misleading statements the model failed to catch.",
      icon: CircleAlert,
    },
    {
      term: `Threshold ${data.threshold}`,
      // Keep the provenance note (tuned on the validation split) from before.
      detail: "Predictions above this P(misleading) cut-off are classified as misleading; tuned on the LIAR validation split.",
      icon: Target,
    },
  ];

  return (
    <RevealCard className="p-5" index={1}>
      <SectionHeading
        eyebrow="Executive interpretation"
        title="Evaluation Summary"
        description="A plain-language reading of the model's most important evaluation signals."
        icon={Info}
      />
      <div className="space-y-3">
        {items.map(({ term, detail, icon: Icon }) => (
          <div key={term} className="flex gap-3 rounded-2xl border bg-muted/15 p-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold">{term}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</div>
            </div>
          </div>
        ))}
      </div>
    </RevealCard>
  );
}

function DefinitionCard({ title, eyebrow, icon: Icon, items, index = 0 }: {
  title: string;
  eyebrow: string;
  icon: React.ElementType;
  items: Array<{ label: string; value: React.ReactNode }>;
  index?: number;
}) {
  return (
    <RevealCard className="p-5" index={index}>
      <SectionHeading eyebrow={eyebrow} title={title} icon={Icon} />
      <dl className="divide-y divide-border rounded-2xl border px-4">
        {items.map(({ label, value }) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-5">
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm leading-relaxed text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </RevealCard>
  );
}

export default function EvaluationPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getEvaluation();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Cannot connect to backend.");
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

  const lastRun = data?.generated_at ? new Date(data.generated_at * 1000).toLocaleString() : null;

  return (
    <main className="w-full bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] bg-surface text-surface-foreground shadow-card">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 140% at 0% 0%, rgba(249,115,22,0.20), rgba(249,115,22,0) 52%), radial-gradient(85% 95% at 100% 100%, rgba(249,115,22,0.12), rgba(249,115,22,0) 60%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ opacity: 0.08, mixBlendMode: "overlay", backgroundSize: "180px 180px", backgroundImage: `url("${GRAIN}")` }}
          />

          <div className="relative z-10 p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
                    Model evaluation
                  </span>
                  {data && <Badge variant="secondary" className="bg-white/10 text-white hover:bg-white/15">{data.model_mode}</Badge>}
                </div>
                <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Evaluation <span className="text-brand">Dashboard</span>
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-surface-foreground/70 sm:text-base">
                  A research-style view of classifier performance on the <strong className="text-surface-foreground">LIAR benchmark</strong> test split — <strong className="text-surface-foreground">896 fact-checked political statements</strong> (448 Reliable, 448 Misleading).
                </p>

                {data && (
                  <div className="mt-5 flex flex-wrap gap-2 text-xs text-surface-foreground/70">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{data.total_samples} samples</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Threshold {data.threshold}</span>
                    {lastRun && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Last run {lastRun}</span>}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={rerunEval}
                  disabled={loading || initialLoading}
                  className="border-white/15 bg-white/5 text-surface-foreground hover:bg-white/10 hover:text-white"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {loading ? "Running…" : "Re-run Evaluation"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/app")}
                  className="border-white/15 bg-white/5 text-surface-foreground hover:bg-white/10 hover:text-white"
                >
                  <ArrowLeft />
                  Back
                </Button>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <Alert variant="destructive" className="rounded-2xl">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {initialLoading && (
          <div className="flex items-center justify-center gap-2 rounded-3xl border bg-card py-14 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading saved evaluation…
          </div>
        )}

        {!initialLoading && !data && !error && (
          <RevealCard className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <FlaskConical className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold">No evaluation result yet</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Run the evaluation once to generate and persist the first model performance report.
            </p>
            <Button onClick={rerunEval} disabled={loading} className="mt-5">
              {loading ? <Loader2 className="animate-spin" /> : <Play />}
              {loading ? "Running evaluation…" : "Run Evaluation"}
            </Button>
          </RevealCard>
        )}

        {data && (
          <>
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">Headline results</p>
                  <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Overall model performance</h2>
                </div>
                <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                  <span className="inline-block h-2 w-2 rounded-full bg-brand" /> Higher is better
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Accuracy" value={data.accuracy} subtitle="Overall proportion of correct predictions" index={0} featured icon={Gauge} />
                <MetricCard label="AUC-ROC" value={data.roc_auc} subtitle="Ability to distinguish misleading from reliable claims" index={1} featured icon={TrendingUp} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MiniMetric label="Macro F1" value={data.macro_f1} subtitle="Balance of precision and recall" index={0} />
                <MiniMetric label="Macro Precision" value={data.macro_precision} subtitle="Average class-level precision" index={1} />
                <MiniMetric label="Macro Recall" value={data.macro_recall} subtitle="Average class-level recall" index={2} />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-dashed bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                <span>Because the test split is balanced (448 Reliable / 448 Misleading), accuracy and the macro-averaged metrics naturally converge to similar values.</span>
              </div>
            </section>

            <section>
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">Diagnostic analysis</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Where the model succeeds and fails</h2>
              </div>
              <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <RocCurve points={data.roc_curve} auc={data.roc_auc} />
                <Interpretation data={data} />
              </div>
            </section>

            <section>
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">Detailed breakdown</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Classification quality</h2>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <ConfusionMatrix cm={data.confusion_matrix} />
                <ClassReport perClass={data.per_class} />
              </div>
            </section>

            <section>
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">Research context</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Methodology & reproducibility</h2>
              </div>
              {/* items-start so each card is its own content height — if the two
                  still differ after merging, neither stretches into an empty void. */}
              <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
                <DefinitionCard
                  eyebrow="Evaluation protocol"
                  title="Methodology"
                  icon={Database}
                  items={[
                    { label: "Dataset", value: <>LIAR benchmark test split (Wang, 2017): <br/> 896 short political claims from PolitiFact, balanced at 448 per class.</> },
                    { label: "Label mapping", value: <>pants-fire / false / barely-true → Misleading<br />mostly-true / true → Reliable<br />half-true excluded as ambiguous</> },                    { label: "Out-of-domain", value: <>Trained on full news articles (ISOT), tested on short political claims to probe generalisation beyond the training distribution.</> },
                    { label: "Scope", value: <>Metrics shown here are from the NLP classifier only.</> },
                  ]}
                  index={0}
                />

                <DefinitionCard
                  eyebrow="Stability check"
                  title="Reproducibility"
                  icon={FlaskConical}
                  items={[
                    { label: "Deployed model", value: <>Headline metrics are from the original seed-42 training run. The study below re-trained from scratch under each seed, so its seed-42 run is a separate artefact.</> },
                    { label: "Separate study", value: <>Not a different model — the identical stage-2 pipeline was re-run under {SEED_VARIANCE.n} fixed seeds ({SEED_VARIANCE.seeds.join(", ")}).</> },
                    {
                      label: "Results",
                      value: (
                        <>
                          <span className="font-semibold tabular-nums">
                            Macro-F1 {SEED_VARIANCE.macroF1.mean.toFixed(3)} ± {SEED_VARIANCE.macroF1.std.toFixed(3)}
                          </span>{" "}
                          and{" "}
                          <span className="font-semibold tabular-nums">
                            AUC {SEED_VARIANCE.auc.mean.toFixed(3)} ± {SEED_VARIANCE.auc.std.toFixed(3)}
                          </span>{" "}
                          (mean ± sample standard deviation, n = {SEED_VARIANCE.n}).
                        </>
                      ),
                    },
                    {
                      label: "Caveat",
                      value: (
                        <>
                          The deployed figures fall within this spread; with only{" "}
                          {SEED_VARIANCE.n} seeds this indicates run-to-run stability, not a confidence interval.
                        </>
                      ),
                    },
                  ]}
                  index={1}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
