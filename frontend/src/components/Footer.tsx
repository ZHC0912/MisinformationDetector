// ============================================================
// FOOTER (MIDAS identity) — dark navy surface.
// Rendered inside the /app page composition (not global) so it doesn't
// disturb the landing / evaluation pages.
// ============================================================

import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-14 bg-surface text-surface-foreground">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <ShieldCheck className="h-[18px] w-[18px]" />
              </span>
              <span className="font-display text-lg font-extrabold tracking-tight">
                MIDAS
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-surface-foreground/60">
              Misinformation Detection &amp; Analysis System. Automated
              credibility assessment for news and social-media content — always
              verify important claims with independent sources.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:gap-14">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-surface-foreground/40">
                Product
              </div>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link
                    to="/app"
                    className="text-surface-foreground/70 transition-colors hover:text-brand"
                  >
                    Analyse content
                  </Link>
                </li>
                <li>
                  <Link
                    to="/evaluation"
                    className="text-surface-foreground/70 transition-colors hover:text-brand"
                  >
                    Model evaluation
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-surface-foreground/40">
                Data sources
              </div>
              <ul className="mt-3 space-y-2 text-surface-foreground/70">
                <li>Google Fact Check Tools</li>
                <li>Media Bias/Fact Check tiers</li>
                <li>DistilBERT · ISOT + LIAR</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-surface-muted pt-6 text-xs text-surface-foreground/40">
          MIDAS — final-year project. Fact-check data © their respective
          publishers, retrieved via the Google Fact Check Tools API.
        </div>
      </div>
    </footer>
  );
}
