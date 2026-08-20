// ============================================================
// LANDING PAGE  (route: /)
//
// Dark, standalone marketing page — navy base, orange accent, glow +
// grain atmosphere. It is DELIBERATELY dark and differs from the light
// /app pages; it renders its OWN pill navbar + footer and sits outside
// the shared Layout (see App.tsx), so nothing here affects other routes.
//
// It is fully self-contained: the dark palette lives in CSS custom
// properties scoped to `.mid` (the global light design tokens in
// index.css are left untouched — /app depends on them). All motion is
// CSS keyframes + the shared useRevealOnScroll/useCountUp hooks; no
// animation library. Everything honours prefers-reduced-motion.
//
// Ported from the "MIDAS Landing v2" design, with three carried-over
// sections restyled into the dark look: the scroll-driven demo
// (ScrollDemo.tsx), the 34-respondent user study, and the SDG-16 note.
// ============================================================

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ArrowRight,
  Type as TypeIcon,
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  ClipboardPaste,
  Cpu,
  GitCompare,
  ScanSearch,
  Gauge,
  AlignLeft,
  Highlighter,
  Library,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useRevealOnScroll,
  revealClass,
  useCountUp,
} from "@/hooks/useRevealOnScroll";
import ScrollDemo from "@/components/ScrollDemo";

// ── Scoped stylesheet ─────────────────────────────────────────
// All landing-only CSS. Scoped under `.mid`; the custom properties
// here shadow nothing global. Keyframes are namespaced (mid-*) so they
// cannot collide with the app.
const CSS = `
.mid {
  --bg: #1B1E24;
  --bg-deep: #0E1013;
  --ink: #E7EBEF;
  --accent: #F97316;
  --accent-hi: #FFA34D;
  --good: #34D07F;
  --good-hi: #7CE3AD;
  --warn: #F5B43F;
  --bad: #E5484D;
  --bad-hi: #FF9DA0;
  --line: rgba(255,255,255,.12);
  --line-strong: rgba(255,255,255,.16);
  --glass: linear-gradient(165deg, rgba(255,255,255,.1), rgba(255,255,255,.03));
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --display: 'Poppins', 'Inter', ui-sans-serif, system-ui, sans-serif;

  position: relative;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  /* clip (not hidden): still clips the atmosphere/marquee horizontally, but
     does NOT create a scroll container — so ScrollDemo's position:sticky card
     keeps pinning to the viewport instead of to this wrapper. */
  overflow-x: clip;
}
.mid ::selection { background: var(--accent); color: #fff; }

/* ── Atmosphere: fixed glow blobs + vignette + grain ── */
.mid-atmos { position: fixed; inset: 0; z-index: 0; pointer-events: none; animation: mid-hue 24s ease-in-out infinite; }
.mid-blob { position: absolute; border-radius: 50%; }
.mid-blob-1 { top:-18vh; left:-10vw; width:70vw; height:70vw; background:radial-gradient(circle at 50% 50%,rgba(249,115,22,.22),rgba(249,115,22,0) 62%); filter:blur(30px); animation:mid-drift1 26s ease-in-out infinite; }
.mid-blob-2 { top:10vh; right:-18vw; width:62vw; height:62vw; background:radial-gradient(circle at 50% 50%,rgba(249,115,22,.30),rgba(249,115,22,0) 60%); filter:blur(40px); animation:mid-drift2 31s ease-in-out infinite; }
.mid-blob-3 { bottom:-24vh; left:18vw; width:66vw; height:66vw; background:radial-gradient(circle at 50% 50%,rgba(52,60,74,.75),rgba(52,60,74,0) 64%); filter:blur(36px); animation:mid-drift3 38s ease-in-out infinite; }
.mid-blob-grade { position:absolute; inset:0; border-radius:0; background:linear-gradient(180deg,rgba(27,30,36,.35) 0%,rgba(27,30,36,.1) 40%,rgba(17,19,24,.88) 100%); }
.mid-vignette { position: fixed; inset: 0; z-index: 3; pointer-events: none; background: radial-gradient(ellipse at 50% 38%, rgba(0,0,0,0) 42%, rgba(9,11,14,.6) 100%); }
.mid-grain { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: .13; mix-blend-mode: overlay; background-size: 200px 200px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E"); }

.mid-layer { position: relative; z-index: 1; }
.mid-progress { position: fixed; top: 0; left: 0; height: 2px; width: 0%; z-index: 60; background: var(--accent); transition: width .1s linear; }

/* ── Layout helpers ── */
.mid-wrap { margin: 0 auto; max-width: 1180px; padding-left: 24px; padding-right: 24px; }
.mid-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: rgba(231,235,239,.5); }
.mid-h2 { margin: 18px 0 0; font-family: var(--display); font-size: clamp(32px, 5vw, 52px); font-weight: 800; line-height: 1.1; letter-spacing: -.04em; }
.mid-accent { color: var(--accent); }

/* ── Nav (floating pill) ── */
.mid-nav { position: fixed; top: 20px; left: 0; right: 0; z-index: 50; display: flex; justify-content: center; padding: 0 20px; }
.mid-navbar { display: flex; width: 100%; max-width: 1180px; align-items: center; gap: 20px; border-radius: 9999px; border: 1px solid rgba(255,255,255,.13); background: rgba(27,30,36,.6); backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%); padding: 10px 14px 10px 18px; box-shadow: 0 18px 50px rgba(6,7,10,.5); }
.mid-brand { display: flex; align-items: center; gap: 10px; color: var(--ink); }
.mid-brand-mark { display: flex; height: 30px; width: 30px; align-items: center; justify-content: center; border-radius: 9px; background: var(--accent); color: #fff; box-shadow: 0 6px 18px rgba(249,115,22,.32); }
.mid-brand-name { font-family: var(--display); font-size: 17px; font-weight: 800; letter-spacing: -.02em; }
.mid-nav-div { height: 18px; width: 1px; background: rgba(255,255,255,.12); }
.mid-nav-links { display: flex; align-items: center; gap: 4px; font-size: 14px; }
.mid-navlink { border-radius: 9999px; padding: 8px 14px; color: rgba(231,235,239,.7); font-weight: 500; transition: background .2s, color .2s; }
.mid-navlink:hover { background: rgba(255,255,255,.07); color: var(--ink); }
.mid-nav-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.mid-nav-tag { display: none; font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: rgba(231,235,239,.4); }

/* ── Buttons ── */
.mid-btn { display: inline-flex; align-items: center; gap: 8px; border-radius: 14px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; box-shadow: 0 14px 40px rgba(249,115,22,.3); transition: transform .2s, background .2s, box-shadow .2s; }
.mid-btn:hover { transform: translateY(-2px); background: var(--accent-hi); color: #fff; box-shadow: 0 20px 52px rgba(249,115,22,.42); }
.mid-btn-pill { height: 38px; border-radius: 9999px; padding: 0 18px; font-size: 14px; box-shadow: none; color: #1B1E24; }
.mid-btn-pill:hover { background: var(--accent-hi); color: #1B1E24; transform: none; box-shadow: none; }
.mid-btn-lg { height: 54px; padding: 0 28px; font-size: 16.5px; }
.mid-btn-ghost { display: inline-flex; align-items: center; gap: 10px; height: 54px; border-radius: 14px; border: 1px solid var(--line-strong); background: rgba(255,255,255,.05); backdrop-filter: blur(14px); padding: 0 24px; font-size: 16px; font-weight: 500; color: rgba(231,235,239,.85); text-decoration: none; transition: background .2s, color .2s; }
.mid-btn-ghost:hover { background: rgba(255,255,255,.1); color: #fff; }
.mid-link-underline { font-size: 15.5px; font-weight: 600; color: rgba(231,235,239,.8); border-bottom: 1px solid rgba(255,255,255,.25); padding-bottom: 3px; text-decoration: none; transition: color .2s; }
.mid-link-underline:hover { color: var(--accent); }

/* ── Hero ── */
.mid-hero { position: relative; padding: 150px 24px 90px; }
.mid-hero-grid { margin: 0 auto; max-width: 1180px; display: grid; grid-template-columns: 1.15fr .85fr; gap: 56px; align-items: center; }
.mid-badge { display: inline-flex; align-items: center; gap: 10px; border-radius: 9999px; border: 1px solid var(--line-strong); background: rgba(255,255,255,.05); backdrop-filter: blur(12px); padding: 7px 14px; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: rgba(231,235,239,.66); }
.mid-dot { display: block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: mid-pulse 2.4s ease-in-out infinite; }
.mid-h1 { margin: 26px 0 0; font-family: var(--display); font-size: clamp(46px, 8.5vw, 88px); font-weight: 800; line-height: 1.06; letter-spacing: -.045em; max-width: 13ch; text-wrap: pretty; }
.mid-lead { margin: 28px 0 0; max-width: 50ch; font-size: clamp(17px, 2.2vw, 20px); line-height: 1.6; color: rgba(231,235,239,.66); }
.mid-btn-row { margin-top: 38px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.mid-chips { margin-top: 42px; display: flex; flex-wrap: wrap; gap: 8px; }
.mid-chip { display: inline-flex; align-items: center; gap: 8px; border-radius: 9999px; border: 1px solid var(--line); background: rgba(255,255,255,.04); padding: 8px 15px; font-size: 13px; color: rgba(231,235,239,.72); }

/* Hero mock card (tilts toward cursor) */
.mid-card-scene { position: relative; transition: transform .3s cubic-bezier(.16,1,.3,1); transform-style: preserve-3d; }
.mid-ghost { position: absolute; border-radius: 28px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); backdrop-filter: blur(8px); }
.mid-ghost-1 { inset: 26px 18px -18px 30px; transform: rotate(6deg); }
.mid-ghost-2 { inset: 14px 24px -8px 22px; border-color: rgba(255,255,255,.1); background: rgba(255,255,255,.04); transform: rotate(-3deg); }
.mid-glass-card { position: relative; border-radius: 28px; border: 1px solid var(--line-strong); background: linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.04)); backdrop-filter: blur(26px) saturate(150%); -webkit-backdrop-filter: blur(26px) saturate(150%); padding: 30px; box-shadow: 0 30px 80px rgba(6,7,10,.55); }
.mid-chip-warn { border-radius: 9999px; border: 1px solid rgba(245,180,63,.45); background: rgba(245,180,63,.14); padding: 5px 12px; font-size: 12px; font-weight: 600; color: var(--warn); }
.mid-chip-good { border-radius: 9999px; border: 1px solid rgba(52,208,127,.45); background: rgba(52,208,127,.14); padding: 5px 12px; font-size: 12px; font-weight: 600; color: var(--good); }
.mid-ring-num { font-family: var(--display); font-size: 56px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
.mid-model-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.04); padding: 14px 16px; }
.mid-fine { font-size: 12px; line-height: 1.6; color: rgba(231,235,239,.4); }

/* ── Marquee ── */
.mid-marquee { position: relative; overflow: hidden; border-top: 1px solid rgba(255,255,255,.08); border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.02); padding: 18px 0; }
.mid-marquee-track { display: flex; width: max-content; animation: mid-marquee 28s linear infinite; }
.mid-marquee-row { display: flex; align-items: center; gap: 34px; padding-right: 34px; font-family: var(--mono); font-size: 12.5px; letter-spacing: .2em; text-transform: uppercase; color: rgba(231,235,239,.42); }
.mid-marquee-sep { color: rgba(231,235,239,.22); }

/* ── Sections ── */
.mid-section { position: relative; padding: clamp(80px, 12vw, 120px) 24px; }
.mid-section-head { display: grid; grid-template-columns: 1fr auto; gap: 40px; align-items: end; }
.mid-section-sub { margin: 0; max-width: 30ch; font-size: 15.5px; line-height: 1.7; color: rgba(231,235,239,.55); }

/* How it works — staircase of glass cards */
.mid-steps { margin-top: 64px; display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; align-items: stretch; }
.mid-step { position: relative; border-radius: 22px; border: 1px solid var(--line); background: var(--glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 26px; }
.mid-step:nth-child(2) { margin-top: 28px; }
.mid-step:nth-child(3) { margin-top: 56px; }
.mid-step:nth-child(4) { margin-top: 84px; }
.mid-step-ic { display: flex; height: 42px; width: 42px; align-items: center; justify-content: center; border-radius: 13px; background: rgba(255,255,255,.06); border: 1px solid var(--line-strong); color: rgba(231,235,239,.85); }
.mid-step-no { font-family: var(--mono); font-size: 11px; color: rgba(231,235,239,.35); }
.mid-step-h { margin: 22px 0 0; font-family: var(--display); font-size: 20px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
.mid-step-p { margin: 10px 0 0; font-size: 14.5px; line-height: 1.65; color: rgba(231,235,239,.58); }

/* What you get — feature cards */
.mid-what { margin-top: 56px; display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.mid-feature { border-radius: 26px; border: 1px solid rgba(255,255,255,.13); background: linear-gradient(155deg,rgba(255,255,255,.09),rgba(255,255,255,.03)); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px); padding: 32px; box-shadow: 0 24px 60px rgba(6,7,10,.35); }
.mid-feature-tag { display: flex; align-items: center; gap: 10px; color: rgba(231,235,239,.75); }
.mid-feature-tag span { font-family: var(--mono); font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: rgba(231,235,239,.55); }
.mid-feature-h { margin: 16px 0 0; font-family: var(--display); font-size: clamp(24px, 3vw, 28px); font-weight: 700; letter-spacing: -.025em; }
.mid-feature-p { margin: 12px 0 0; font-size: 16px; line-height: 1.65; color: rgba(231,235,239,.6); }
.mid-panel { margin-top: 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,.1); background: rgba(20,22,27,.5); padding: 22px; }
.mid-bar { height: 8px; border-radius: 9999px; background: rgba(255,255,255,.09); overflow: hidden; }
.mid-bar-sm { height: 7px; }
.mid-bar > i { display: block; height: 100%; border-radius: 9999px; }
.mid-word { border-radius: 6px; padding: 3px 7px; color: rgba(231,235,239,.75); }
.mid-word-bad { background: rgba(229,72,77,.18); border: 1px solid rgba(229,72,77,.42); color: var(--bad-hi); font-weight: 600; }
.mid-word-good { background: rgba(52,208,127,.16); border: 1px solid rgba(52,208,127,.4); color: var(--good-hi); font-weight: 600; }

/* Stats (user study) */
.mid-stats-grid { margin-top: 56px; display: grid; grid-template-columns: repeat(4,1fr); gap: 24px; }
.mid-stat-num { font-family: var(--display); font-size: clamp(34px, 4vw, 44px); font-weight: 800; letter-spacing: -.03em; color: var(--accent); font-variant-numeric: tabular-nums; }
.mid-stat-label { margin: 10px auto 0; max-width: 22ch; font-size: 14px; line-height: 1.5; color: rgba(231,235,239,.58); }

/* SDG strip */
.mid-sdg { display: flex; align-items: center; gap: 16px; border-radius: 18px; border: 1px solid var(--line); background: rgba(255,255,255,.03); padding: 20px 22px; }
.mid-sdg-ic { display: flex; height: 44px; width: 44px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 12px; border: 1px solid var(--line-strong); color: var(--accent); }

/* Limits (deep band) */
.mid-limits { position: relative; background: var(--bg-deep); border-top: 1px solid rgba(255,255,255,.07); border-bottom: 1px solid rgba(255,255,255,.07); }
.mid-limits-grid { margin: 0 auto; max-width: 1180px; padding: 110px 24px; display: grid; grid-template-columns: auto 1.6fr; gap: 64px; align-items: start; }
.mid-limits-h { margin: 0; font-family: var(--display); font-size: clamp(30px, 4.5vw, 40px); font-weight: 800; line-height: 1.12; letter-spacing: -.035em; }
.mid-limits-badge { display: flex; align-items: center; gap: 12px; }
.mid-limits-badge span:first-child { display: flex; height: 40px; width: 40px; align-items: center; justify-content: center; border-radius: 12px; border: 1px solid var(--line-strong); color: var(--ink); }
.mid-limits-points { margin-top: 40px; display: grid; grid-template-columns: repeat(3,1fr); gap: 28px; }
.mid-limit-point { border-top: 1px solid var(--line-strong); padding-top: 18px; }
.mid-limit-point-label { display: flex; align-items: center; gap: 9px; font-family: var(--mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: rgba(231,235,239,.9); }
.mid-limit-point-label span { display: block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.mid-limit-point-p { margin: 12px 0 0; font-size: 15.5px; line-height: 1.65; color: rgba(231,235,239,.6); }

/* Final CTA */
.mid-cta-sec { position: relative; overflow: hidden; padding: clamp(72px, 9vw, 100px) 24px; }
.mid-cta-glow { position: absolute; left: 50%; top: 10%; width: 120vw; height: 80vh; transform: translateX(-50%); background: radial-gradient(ellipse at 50% 40%,rgba(249,115,22,.24),rgba(249,115,22,.08) 45%,rgba(27,30,36,0) 72%); filter: blur(20px); pointer-events: none; }
/* Closing CTA is centred — the one deliberately-centred band on an otherwise
   left-aligned page (classic closing call-to-action pattern). */
.mid-cta-grid { position: relative; margin: 0 auto; max-width: 760px; text-align: center; }
.mid-cta-h { margin: 0 auto; font-family: var(--display); font-size: clamp(40px, 6.5vw, 66px); font-weight: 800; line-height: 1.08; letter-spacing: -.045em; max-width: 20ch; }
.mid-attribution { margin: 28px auto 0; max-width: 60ch; font-family: var(--mono); font-size: 12.5px; line-height: 1.9; color: rgba(231,235,239,.45); }

/* Footer */
.mid-footer { position: relative; border-top: 1px solid rgba(255,255,255,.09); background: rgba(16,18,22,.6); backdrop-filter: blur(20px); }
.mid-foot-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 48px; }
.mid-foot-head { font-family: var(--mono); font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: rgba(231,235,239,.38); }
.mid-foot-list { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; font-size: 14.5px; }
.mid-foot-link { color: rgba(231,235,239,.7); text-decoration: none; transition: color .2s; }
.mid-foot-link:hover { color: var(--accent); }
.mid-foot-bottom { margin-top: 48px; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; border-top: 1px solid rgba(255,255,255,.08); padding-top: 24px; font-family: var(--mono); font-size: 11.5px; color: rgba(231,235,239,.35); }

/* ── Keyframes ── */
@keyframes mid-drift1 { 0%,100% { transform: translate3d(0,0,0) scale(1); } 33% { transform: translate3d(9vw,6vh,0) scale(1.18); } 66% { transform: translate3d(-6vw,10vh,0) scale(.92); } }
@keyframes mid-drift2 { 0%,100% { transform: translate3d(0,0,0) scale(1.05); } 40% { transform: translate3d(-11vw,-7vh,0) scale(.88); } 70% { transform: translate3d(7vw,8vh,0) scale(1.2); } }
@keyframes mid-drift3 { 0%,100% { transform: translate3d(0,0,0) scale(.95); } 50% { transform: translate3d(12vw,-9vh,0) scale(1.25); } }
@keyframes mid-hue { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(24deg); } }
@keyframes mid-sweep { from { stroke-dashoffset: 553; } to { stroke-dashoffset: 11; } }
@keyframes mid-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes mid-pulse { 0%,100% { opacity: .25; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }

/* ── Responsive ── */
@media (min-width: 720px) { .mid-nav-tag { display: block; } }
@media (max-width: 960px) {
  .mid-hero-grid { grid-template-columns: 1fr; gap: 40px; }
  .mid-card-scene { max-width: 420px; }
  .mid-steps { grid-template-columns: repeat(2,1fr); }
  .mid-step:nth-child(2), .mid-step:nth-child(3), .mid-step:nth-child(4) { margin-top: 0; }
  .mid-what { grid-template-columns: 1fr; }
  .mid-limits-grid { grid-template-columns: 1fr; gap: 28px; }
  .mid-stats-grid { grid-template-columns: repeat(2,1fr); }
  .mid-foot-grid { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 640px) {
  .mid-hero { padding-top: 140px; }
  .mid-section-head { grid-template-columns: 1fr; align-items: start; }
  .mid-nav-links { display: none; }
  .mid-limits-points { grid-template-columns: 1fr; gap: 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .mid-atmos, .mid-blob-1, .mid-blob-2, .mid-blob-3, .mid-marquee-track, .mid-dot { animation: none !important; }
  .mid-glass-card svg circle { animation: none !important; }
}
`;

// ── Small building blocks ─────────────────────────────────────

// Progress bar + hero-card tilt effect (both plain DOM, no library).
function useLandingMotion(
  barRef: React.RefObject<HTMLDivElement | null>,
  sceneRef: React.RefObject<HTMLDivElement | null>,
  cardRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    // Top scroll-progress bar.
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = document.scrollingElement || document.documentElement;
      const h = el.scrollHeight - el.clientHeight;
      const p = h > 40 ? Math.min(1, el.scrollTop / h) : 0;
      if (barRef.current) barRef.current.style.width = (p * 100).toFixed(2) + "%";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // Hero-card mouse tilt (skipped when reduced motion is preferred).
    const scene = sceneRef.current;
    const card = cardRef.current;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const onMove = (ev: PointerEvent) => {
      if (!scene || !card) return;
      const r = scene.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(1000px) rotateY(${(x * 9).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(2)}deg) translateZ(0)`;
    };
    const onLeave = () => {
      if (card) card.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg)";
    };
    if (scene && card && !reduce) {
      scene.addEventListener("pointermove", onMove);
      scene.addEventListener("pointerleave", onLeave);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (scene) {
        scene.removeEventListener("pointermove", onMove);
        scene.removeEventListener("pointerleave", onLeave);
      }
    };
  }, [barRef, sceneRef, cardRef]);
}

// ── Nav ───────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="mid-nav">
      <div className="mid-navbar">
        <a href="#top" className="mid-brand">
          <span className="mid-brand-mark">
            <ShieldCheck size={17} />
          </span>
          <span className="mid-brand-name">MIDAS</span>
        </a>
        <span className="mid-nav-div" />
        <nav className="mid-nav-links">
          <a href="#how" className="mid-navlink">How it works</a>
          <a href="#what" className="mid-navlink">What you get</a>
          <a href="#limits" className="mid-navlink">Limits</a>
        </nav>
        <div className="mid-nav-right">
          <Link to="/app" className="mid-btn mid-btn-pill">
            Analyse a claim
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────
const HERO_CHIPS = [
  { Icon: TypeIcon, label: "Headline" },
  { Icon: FileText, label: "Full article" },
  { Icon: LinkIcon, label: "Article link" },
  { Icon: ImageIcon, label: "Image" },
];

function Hero({
  sceneRef,
  cardRef,
}: {
  sceneRef: React.RefObject<HTMLDivElement | null>;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section id="top" className="mid-hero" ref={sceneRef as React.RefObject<HTMLElement>}>
      <div className="mid-hero-grid">
        <div>
          <div className="mid-badge">
            <span className="mid-dot" />
            AI credibility engine
          </div>
          <h1 className="mid-h1">
            Every claim gets a <span className="mid-accent">verdict</span>
          </h1>
          <p className="mid-lead">
            Paste a headline, a full article, a link, or an image. MIDAS returns
            a credibility score and shows you the reasoning behind it.
          </p>
          <div className="mid-btn-row">
            <Link to="/app" className="mid-btn mid-btn-lg">
              Analyse a claim <ArrowRight size={17} />
            </Link>
            <a href="#how" className="mid-btn-ghost">
              See how it works
            </a>
          </div>
          <div className="mid-chips">
            {HERO_CHIPS.map(({ Icon, label }) => (
              <span key={label} className="mid-chip">
                <Icon size={14} /> {label}
              </span>
            ))}
          </div>
        </div>

        {/* Pre-recorded REAL /analyse output (run 2026-08-19): a genuine news
            article → credibility_score 98, style_verdict "Reliable", 98.9%
            confidence. Score/verdict/ring are the true model numbers; the ring
            colour follows ResultsPage scoreTone (≥70 → green). Not a live call. */}
        <div className="mid-card-scene" ref={cardRef}>
          <div className="mid-ghost mid-ghost-1" />
          <div className="mid-ghost mid-ghost-2" />
          <div className="mid-glass-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(231,235,239,.5)" }}>
                Example output
              </span>
              <span className="mid-chip-good">Reliable</span>
            </div>
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative", width: 212, height: 212 }}>
                <svg viewBox="0 0 212 212" width="212" height="212" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="106" cy="106" r="88" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="14" />
                  <circle cx="106" cy="106" r="88" fill="none" stroke="var(--good)" strokeWidth="14" strokeLinecap="round" strokeDasharray="553" strokeDashoffset="11" style={{ animation: "mid-sweep 1.8s cubic-bezier(.16,1,.3,1) .3s both" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div className="mid-ring-num">98</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", color: "rgba(231,235,239,.45)" }}>/ 100</div>
                </div>
              </div>
              {/* Ring label — same eyebrow treatment as "Example output", matching
                  the CREDIBILITY label under the ScrollDemo / ResultsPage ring. */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(231,235,239,.5)" }}>
                Credibility
              </span>
            </div>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="mid-model-row">
                <span style={{ fontSize: 13.5, color: "rgba(231,235,239,.8)" }}>Writing-style model</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "rgba(231,235,239,.6)" }}>DistilBERT</span>
              </div>
              <div className="mid-model-row">
                <span style={{ fontSize: 13.5, color: "rgba(231,235,239,.8)" }}>Fact-check cross-check</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "rgba(231,235,239,.6)" }}>ClaimReview</span>
              </div>
            </div>
            <p className="mid-fine" style={{ marginTop: 18 }}>
              Pre-recorded from an actual analyse run not a live API call.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Marquee ───────────────────────────────────────────────────
const MARQUEE_TAGS = [
  "Headline", "Full article", "Article link", "Image",
  "Paragraph scoring", "SHAP", "LIME", "Source reliability",
];

function MarqueeRow() {
  return (
    <span className="mid-marquee-row">
      {MARQUEE_TAGS.map((t, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 34 }}>
          {t}
          <span className="mid-marquee-sep">◆</span>
        </span>
      ))}
    </span>
  );
}

function Marquee() {
  return (
    <div className="mid-marquee" aria-hidden="true">
      <div className="mid-marquee-track">
        <MarqueeRow />
        <MarqueeRow />
      </div>
    </div>
  );
}

// ── How it works ──────────────────────────────────────────────
const STEPS = [
  { Icon: ClipboardPaste, title: "Paste text, a link, or an image", body: "A headline, a full article, a URL to fetch, or a screenshot to read." },
  { Icon: Cpu, title: "The NLP model scores credibility", body: "A DistilBERT model, fine-tuned for this task, analyses how the text is written." },
  { Icon: GitCompare, title: "Cross-checked against real fact-checks", body: "MIDAS searches Google's ClaimReview corpus for published fact-checks on the same claim." },
  { Icon: ScanSearch, title: "You get an explainable result", body: "A score, an explanation, and the specific words and paragraphs that shaped it." },
];

function HowItWorks() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section id="how" className="mid-section">
      <div className="mid-wrap">
        <div className="mid-section-head">
          <div>
            <div className="mid-eyebrow">How it works</div>
            <h2 className="mid-h2" style={{ maxWidth: "20ch" }}>
              Four steps from raw text to an explained result
            </h2>
          </div>
          <p className="mid-section-sub">
            Two independent signals, then an explanation of how they combined.
          </p>
        </div>
        <div ref={ref} className="mid-steps">
          {STEPS.map(({ Icon, title, body }, i) => (
            <div
              key={i}
              className={cn("mid-step", revealClass(visible))}
              style={{ transitionDelay: visible ? `${i * 110}ms` : "0ms" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mid-step-ic"><Icon size={19} /></span>
                <span className="mid-step-no">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mid-step-h">{title}</h3>
              <p className="mid-step-p">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── What you get ──────────────────────────────────────────────
function WhatYouGet() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  const featureClass = cn("mid-feature", revealClass(visible));
  const delay = (i: number) => ({ transitionDelay: visible ? `${i * 90}ms` : "0ms" });
  const ringC = 2 * Math.PI * 48; // score-ring circumference (r=48)

  return (
    <section id="what" className="mid-section" style={{ paddingBottom: "clamp(90px,14vw,130px)" }}>
      <div className="mid-wrap">
        <div style={{ maxWidth: "46ch" }}>
          <div className="mid-eyebrow">What you get</div>
          <h2 className="mid-h2">Four views of the same verdict</h2>
        </div>

        <div ref={ref} className="mid-what">
          {/* Credibility score */}
          <div className={featureClass} style={delay(0)}>
            <div className="mid-feature-tag"><Gauge size={18} /><span>Credibility score</span></div>
            <h3 className="mid-feature-h">A score, and why it landed there</h3>
            <p className="mid-feature-p" style={{ maxWidth: "48ch" }}>
              One headline number for the whole submission, with a plain-language
              explanation of the signals behind it.
            </p>
            <div className="mid-panel">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(231,235,239,.45)" }}>Example</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--warn)" }}>mixed signals</span>
              </div>
              {/* Score ring + Reliable/Misleading probability bars — mirrors the
                  real ResultsPage ScoreRing (tone by value: amber at 58) + ConfBar. */}
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 18 }}>
                <svg width="76" height="76" viewBox="0 0 114 114" style={{ flexShrink: 0 }} aria-hidden="true">
                  <circle cx="57" cy="57" r="48" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="9" />
                  <circle
                    cx="57" cy="57" r="48" fill="none"
                    stroke="var(--warn)" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={ringC} strokeDashoffset={ringC * (1 - 0.58)}
                    transform="rotate(-90 57 57)"
                  />
                  <text x="57" y="55" textAnchor="middle" fill="#fff" fontSize="30" fontWeight="700" style={{ fontFamily: "var(--display)" }}>58</text>
                  <text x="57" y="74" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="13">/100</text>
                </svg>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "rgba(231,235,239,.6)" }}>
                      <span>Reliable</span><span>58%</span>
                    </div>
                    <div className="mid-bar mid-bar-sm" style={{ marginTop: 6 }}><i style={{ width: "58%", background: "var(--good)" }} /></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "rgba(231,235,239,.6)" }}>
                      <span>Misleading</span><span>42%</span>
                    </div>
                    <div className="mid-bar mid-bar-sm" style={{ marginTop: 6 }}><i style={{ width: "42%", background: "var(--bad)" }} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Paragraph breakdown */}
          <div className={featureClass} style={delay(1)}>
            <div className="mid-feature-tag"><AlignLeft size={18} /><span>Paragraph breakdown</span></div>
            <h3 className="mid-feature-h">Scored paragraph by paragraph</h3>
            <p className="mid-feature-p" style={{ maxWidth: "42ch" }}>
              See which sections of a long article pull the score down, instead of
              judging the whole piece at once.
            </p>
            {/* Mirrors the real ResultsPage paragraph strip: ¶ N + a bar whose
                WIDTH is the misleading probability, coloured green (<50%) or red
                (≥50%) — the same two-tone threshold, no amber — plus % misleading. */}
            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { n: "¶ 1", mis: 16 },
                { n: "¶ 2", mis: 48 },
                { n: "¶ 3", mis: 84 },
              ].map((r) => {
                const bad = r.mis >= 50;
                const c = bad ? "var(--bad)" : "var(--good)";
                return (
                  <div key={r.n} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "rgba(231,235,239,.4)" }}>{r.n}</span>
                    <div className="mid-bar"><i style={{ width: `${r.mis}%`, background: c }} /></div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: c }}>{r.mis}% misleading</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explainability */}
          <div className={featureClass} style={delay(2)}>
            <div className="mid-feature-tag"><Highlighter size={18} /><span>Explainability</span></div>
            <h3 className="mid-feature-h">Word-level, with SHAP and LIME</h3>
            <p className="mid-feature-p" style={{ maxWidth: "44ch" }}>
              The individual words that pushed the model toward or away from
              credible, shown in the text itself.
            </p>
            <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 7, fontSize: 15, lineHeight: 1.9 }}>
              <span className="mid-word">Officials</span>
              <span className="mid-word mid-word-bad">reportedly</span>
              <span className="mid-word">confirmed the</span>
              <span className="mid-word mid-word-good">figures</span>
              <span className="mid-word">on Tuesday</span>
            </div>
          </div>

          {/* Source reliability */}
          <div className={featureClass} style={delay(3)}>
            <div className="mid-feature-tag"><Library size={18} /><span>Source reliability</span></div>
            <h3 className="mid-feature-h">An index of known outlets</h3>
            <p className="mid-feature-p" style={{ maxWidth: "44ch" }}>
              Factual-reporting tiers, MBFC-style, for the outlets MIDAS holds
              ratings for.
            </p>
            {/* Mirrors the real SourceRatingRow: a single UNIFORM orange
                (brand) meter per source, where tier is encoded by the bar's
                LENGTH (tier/5), not by colour. */}
            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 13 }}>
              {[
                { label: "Very high", tier: "tier 5", w: "100%", c: "var(--accent)" },
                { label: "Mostly factual", tier: "tier 3", w: "60%", c: "var(--accent)" },
                { label: "Low", tier: "tier 1", w: "20%", c: "var(--accent)" },
              ].map((r) => (
                <div key={r.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "rgba(231,235,239,.75)" }}>
                    <span>{r.label}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "rgba(231,235,239,.4)" }}>{r.tier}</span>
                  </div>
                  <div className="mid-bar mid-bar-sm" style={{ marginTop: 7 }}><i style={{ width: r.w, background: r.c }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stats (34-respondent user study — carried over) ───────────
const STATS = [
  { value: 82.4, decimals: 1, suffix: "%", label: "want a credibility score as their preferred feature" },
  { value: 97, decimals: 0, suffix: "%", label: "see potential value in an AI-based detection system" },
  { value: 79.4, decimals: 1, suffix: "%", label: "prefer a website over a mobile app" },
  { value: 34, decimals: 0, suffix: "", label: "respondents in the user study behind this design" },
];

function StatNumber({ value, decimals, suffix, active }: { value: number; decimals: number; suffix: string; active: boolean }) {
  const n = useCountUp(value, active);
  return <>{n.toFixed(decimals)}{suffix}</>;
}

function StatsSection() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section className="mid-section" style={{ paddingTop: "clamp(70px,10vw,100px)" }}>
      <div className="mid-wrap">
        <div style={{ maxWidth: "48ch" }}>
          <div className="mid-eyebrow">Grounded in user research</div>
          <h2 className="mid-h2">Designed around what users said they need</h2>
          <p className="mid-section-sub" style={{ marginTop: 14, maxWidth: "52ch" }}>
            A small primary-research survey conducted for this project. The
            figures describe those 34 respondents, not the wider public.
          </p>
        </div>
        <div ref={ref} className="mid-stats-grid">
          {STATS.map((s, i) => (
            <div
              key={i}
              className={cn(revealClass(visible))}
              style={{ transitionDelay: visible ? `${i * 80}ms` : "0ms", textAlign: "center" }}
            >
              <div className="mid-stat-num">
                <StatNumber value={s.value} decimals={s.decimals} suffix={s.suffix} active={visible} />
              </div>
              <div className="mid-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── SDG 16 note (carried over) ────────────────────────────────
function SdgStrip() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section className="mid-section" style={{ paddingTop: 0, paddingBottom: "clamp(80px,12vw,120px)" }}>
      <div className="mid-wrap">
        <div ref={ref} className={cn("mid-sdg", revealClass(visible, false))}>
          <span className="mid-sdg-ic"><Scale size={20} /></span>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(231,235,239,.6)" }}>
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>Aligned with SDG 16 (peace, justice and strong institutions)</span>{" "}
             — promoting public access to
            reliable information.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Limits ────────────────────────────────────────────────────
function Limits() {
  return (
    <section id="limits" className="mid-limits">
      <div className="mid-limits-grid">
        <div className="mid-limits-badge">
          <span><Scale size={19} /></span>
          <span className="mid-eyebrow" style={{ color: "rgba(231,235,239,.45)" }}>Where it stops</span>
        </div>
        <div>
          <h2 className="mid-limits-h" style={{ maxWidth: "20ch" }}>MIDAS is indicative, not authoritative.</h2>
          {/* Same disclosure, broken into three labelled points across the full
              width so the section reads as deliberate. Wording unchanged — each
              point carries the original sentences verbatim. */}
          <div className="mid-limits-points">
            <div className="mid-limit-point">
              <div className="mid-limit-point-label"><span aria-hidden="true" />Style, not facts</div>
              <p className="mid-limit-point-p">
                The score is a model's reading of writing style plus a search of
                existing fact-checks.
              </p>
            </div>
            <div className="mid-limit-point">
              <div className="mid-limit-point-label"><span aria-hidden="true" />It can be wrong</div>
              <p className="mid-limit-point-p">
                It can be wrong, and it is not a substitute for professional
                fact-checking or your own judgement.
              </p>
            </div>
            <div className="mid-limit-point">
              <div className="mid-limit-point-label"><span aria-hidden="true" />Verify important claims</div>
              <p className="mid-limit-point-p">
                Treat a low score as a reason to look closer, not as a verdict, and
                always verify important claims with independent sources.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────
function FinalCta() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <section id="cta" className="mid-cta-sec">
      <div className="mid-cta-glow" aria-hidden="true" />
      <div ref={ref} className={cn("mid-cta-grid", revealClass(visible))}>
        <h2 className="mid-cta-h">Paste something in. See what it finds.</h2>
        <div style={{ marginTop: 28 }}>
          <Link to="/app" className="mid-btn" style={{ height: 56, padding: "0 30px", fontSize: 17 }}>
            Analyse a claim <ArrowRight size={17} />
          </Link>
        </div>
        <p className="mid-attribution">
          MIDAS — Misinformation Detection &amp; Analysis System. A final-year
          project. Fact-check data retrieved via the Google Fact Check Tools API
          and © its respective publishers.
        </p>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="mid-footer">
      <div className="mid-wrap" style={{ padding: "64px 24px 40px" }}>
        <div className="mid-foot-grid">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mid-brand-mark" style={{ boxShadow: "none" }}><ShieldCheck size={17} /></span>
              <span className="mid-brand-name">MIDAS</span>
            </div>
            <p style={{ margin: "14px 0 0", maxWidth: "42ch", fontSize: 14.5, lineHeight: 1.7, color: "rgba(231,235,239,.5)" }}>
              Automated credibility assessment for news and social-media content.
              Always verify important claims with independent sources.
            </p>
          </div>
          <div>
            <div className="mid-foot-head">Product</div>
            <ul className="mid-foot-list">
              <li><Link to="/app" className="mid-foot-link">Analyse content</Link></li>
              <li><a href="#what" className="mid-foot-link">What you get</a></li>
              <li><a href="#limits" className="mid-foot-link">Limits</a></li>
            </ul>
          </div>
          <div>
            <div className="mid-foot-head">Data sources</div>
            <ul className="mid-foot-list" style={{ color: "rgba(231,235,239,.65)" }}>
              <li>Google Fact Check Tools</li>
              <li>DistilBERT · ISOT + LIAR</li>
            </ul>
          </div>
        </div>
        <div className="mid-foot-bottom">
          <span>MIDAS — final-year project</span>
          <span>Fact-check data © their respective publishers</span>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function LandingPage() {
  const barRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useLandingMotion(barRef, sceneRef, cardRef);

  return (
    <div className="mid">
      <style>{CSS}</style>

      {/* Atmosphere (fixed, non-interactive) */}
      <div className="mid-atmos" aria-hidden="true">
        <div className="mid-blob mid-blob-1" />
        <div className="mid-blob mid-blob-2" />
        <div className="mid-blob mid-blob-3" />
        <div className="mid-blob-grade" />
      </div>
      <div className="mid-vignette" aria-hidden="true" />
      <div className="mid-grain" aria-hidden="true" />
      <div className="mid-progress" ref={barRef} aria-hidden="true" />

      <div className="mid-layer">
        <Nav />
        <Hero sceneRef={sceneRef} cardRef={cardRef} />
        <Marquee />
        <ScrollDemo />
        <HowItWorks />
        <WhatYouGet />
        <StatsSection />
        <SdgStrip />
        <Limits />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}
