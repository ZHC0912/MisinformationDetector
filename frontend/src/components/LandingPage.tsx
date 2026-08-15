// ============================================================
// LANDING PAGE  (route: /)
// Standard product-landing structure. Composed of the sub-sections
// below; the scroll-driven demo lives in ScrollDemo.tsx.
//
// Static sections (Problem, HowItWorks, Stats, SDG, FinalCta) use
// the shared useRevealOnScroll hook — a one-shot fade/slide-in the
// first time each enters the viewport. Hero and ScrollDemo keep
// their own treatment.
// ============================================================

import { Link } from "react-router-dom";
import { ArrowRight, FileText, Cpu, BadgeCheck, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useRevealOnScroll,
  revealClass,
  useCountUp,
} from "@/hooks/useRevealOnScroll";
import ScrollDemo from "@/components/ScrollDemo";

// ── 2. Hero ───────────────────────────────────────────────────
function Hero() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-8 pt-16 text-center sm:pt-24">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Detect misinformation from the sources you trust most
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
        Paste an article, import a URL, or upload an image — and get an AI
        credibility assessment that reads the writing style and verifies the
        claims.
      </p>
      <div className="mt-8 flex justify-center">
        <Button
          asChild
          size="lg"
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link to="/app">
            Try it now <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

// ── 4. Problem ────────────────────────────────────────────────
function ProblemSection() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section className="border-t">
      <div
        ref={ref}
        className={cn("mx-auto w-full max-w-3xl px-4 py-16", revealClass(visible))}
      >
        <h2 className="text-2xl font-bold tracking-tight">
          Why influential sources are the hard case
        </h2>
        <div className="mt-4 space-y-4 text-muted-foreground">
          <p>
            False news spreads significantly faster than verified news,
            amplified by the large follower bases of influential accounts.
            Individuals — particularly older adults — tend to over-trust content
            from authoritative sources without scrutiny.
          </p>
          <p>
            Manual fact-checking cannot scale to the volume of daily content from
            institutions and public figures, and existing detection tools
            largely target general news — leaving the unique linguistic patterns
            of influential-source content unaddressed.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── 5. How it works ───────────────────────────────────────────
const STEPS = [
  {
    Icon: FileText,
    title: "Paste, import, or upload",
    body: "Drop in article text, import a URL, or upload a screenshot for on-device OCR.",
  },
  {
    Icon: Cpu,
    title: "Analyse and verify",
    body: "DistilBERT reads the writing style while a fact-check layer verifies the underlying claims.",
  },
  {
    Icon: BadgeCheck,
    title: "Get a clear verdict",
    body: "Receive a credibility score and verdict with a plain-language explanation of why.",
  },
];

function HowItWorks() {
  // Observe the grid; steps stagger in (100ms apart) once it enters view.
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section className="border-t">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <p className="mt-2 text-muted-foreground">
            Three steps from raw content to an explained verdict.
          </p>
        </div>
        <div ref={ref} className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, i) => (
            <div
              key={i}
              className={cn("flex flex-col items-start", revealClass(visible))}
              style={{ transitionDelay: visible ? `${i * 100}ms` : "0ms" }}
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand/20 bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 6. Proof / stats ──────────────────────────────────────────
const STATS = [
  {
    value: 82.4,
    decimals: 1,
    suffix: "%",
    label: "want a credibility score as their preferred feature",
  },
  {
    value: 97,
    decimals: 0,
    suffix: "%",
    label: "see potential value in an AI-based detection system",
  },
  {
    value: 79.4,
    decimals: 1,
    suffix: "%",
    label: "prefer a website over a mobile app",
  },
  {
    value: 34,
    decimals: 0,
    suffix: "",
    label: "respondents in the user study backing this design",
  },
];

function StatNumber({
  value,
  decimals,
  suffix,
  active,
}: {
  value: number;
  decimals: number;
  suffix: string;
  active: boolean;
}) {
  const n = useCountUp(value, active);
  return (
    <>
      {n.toFixed(decimals)}
      {suffix}
    </>
  );
}

function StatsSection() {
  const { ref, visible } = useRevealOnScroll<HTMLDListElement>();
  return (
    <section className="border-t bg-brand/5">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Backed by a 34-respondent user study
          </h2>
          <p className="mt-2 text-muted-foreground">
            The design is grounded in what real users said they need.
          </p>
        </div>
        <dl ref={ref} className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={i}
              className={cn("text-center", revealClass(visible))}
              style={{ transitionDelay: visible ? `${i * 80}ms` : "0ms" }}
            >
              <dt className="text-3xl font-bold tracking-tight tabular-nums text-brand sm:text-4xl">
                <StatNumber
                  value={s.value}
                  decimals={s.decimals}
                  suffix={s.suffix}
                  active={visible}
                />
              </dt>
              <dd className="mx-auto mt-2 max-w-[16rem] text-sm text-muted-foreground">
                {s.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ── 7. SDG alignment ──────────────────────────────────────────
function SdgStrip() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section className="border-t">
      <div
        ref={ref}
        className={cn(
          "mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-8",
          revealClass(visible, false)
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-brand/10 text-brand">
          <Scale className="h-5 w-5" />
        </span>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            Aligned with UN SDG 16
          </span>{" "}
          (peace, justice and strong institutions) — promoting public access to
          reliable information.
        </p>
      </div>
    </section>
  );
}

// ── 8. Final CTA ──────────────────────────────────────────────
function FinalCta() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section className="border-t">
      <div
        ref={ref}
        className={cn(
          "mx-auto w-full max-w-3xl px-4 py-20 text-center",
          revealClass(visible)
        )}
      >
        <p className="text-lg font-medium">
          Paste an article and see what it finds.
        </p>
        <div className="mt-6 flex justify-center">
          <Button
            asChild
            size="lg"
            className="h-12 bg-brand px-8 text-base text-brand-foreground hover:bg-brand/90"
          >
            <Link to="/app">
              Try it now <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ScrollDemo />
      <ProblemSection />
      <HowItWorks />
      <StatsSection />
      <SdgStrip />
      <FinalCta />
    </>
  );
}
