"use client";

import { m } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { duration, ease, stagger, viewport } from "@/lib/motion";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageVisible } from "@/lib/usePageVisible";
import { Cursor, ListChecks, CaretDown, Check } from "@phosphor-icons/react/ssr";
import { SioonaMark } from "@/components/layout/SioonaMark";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { SignalTypeChip } from "@/components/signal/SignalChips";

/** SSR stays settled; observers, media preferences, and tab visibility gate all work. */
function useFeatureLoop(period = 0, steps = 1, pinned = false, settled = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const pageVisible = usePageVisible();
  const [inView, setInView] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const running = !reduced && inView && pageVisible && !pinned;
  useEffect(() => {
    if (!running || !period) return;
    const timer = window.setInterval(() => setStep(value => (value + 1) % steps), period);
    return () => window.clearInterval(timer);
  }, [running, period, steps]);
  return { props: { ref, "data-motion": !reduced, "data-running": running, "data-step": reduced ? settled : step },
    step: reduced ? settled : step };
}

function StaticFallback() {
  return <noscript><p className="feature-static-note">Static illustration · animations are off.</p></noscript>;
}

function WindowChrome() {
  return <div className="feature-window-chrome">
    <span className="feature-window-dots"><i /><i /><i /></span>
    <span className="feature-url" translate="no">sioona / workspace</span>
  </div>;
}

function ReviewerCursor() {
  return <span className="feature-cursor"><Cursor size={20} weight="fill" /><span>You</span></span>;
}

/** Synthetic, display-only illustrations; these controls do not mutate a workspace. */
export function ShadowFeatureStage() {
  const loop = useFeatureLoop(1800, 4, false, 3);
  return <div {...loop.props} data-feature="0" className="feature-shadow">
    <div className="feature-stage-heading"><span>Shadow Mode</span><span className="feature-badge-swap" aria-label="Human-controlled Shadow Mode"><span className="feature-detect-badge"><i className="feature-spinner" />Detecting signal</span><span className="feature-dot-badge" data-tone="warning"><i />You’re in control</span></span></div>
    <p className="feature-stage-subtitle">Your team reviews. Nothing is sent from Sioona.</p>
    <div className="feature-desktop feature-desktop-shadow aspect-[16/10]" role="img" aria-label="Illustrative Shadow Mode workspace with a human reviewer and Sioona. Suggested actions are display-only.">
      <div aria-hidden="true">
        <div className="feature-window feature-window-shadow">
          <WindowChrome />
          <div className="feature-workspace">
            <div className="feature-mini-heading"><SioonaMark solid className="size-4" />Review workspace<span>Shadow Mode</span></div>
            <div className="feature-workspace-field" data-desk="email"><span>Reviewer email · illustrative</span><p>reviewer@example.test</p></div>
            <div className="feature-workspace-field"><span>Suggested next action</span><p>Offer a fee review call.</p></div>
            <div className="feature-handover"><span data-desk="submit">Review suggestion</span><Check size={12} />Display only</div>
          </div>
        </div>
        <span className="feature-handover-cursor"><Cursor size={20} weight="fill" /><span className="feature-cursor-badges"><span className="feature-cursor-agent"><SioonaMark solid className="size-4" />Sioona</span><span className="feature-cursor-human">You</span></span></span>
      </div>
    </div>
    <StaticFallback />
  </div>;
}

const chartBars = [34, 48, 42, 63, 56, 72, 66, 82, 76, 88];
const alternateBars = [52, 38, 59, 47, 74, 61, 84, 71, 91, 80];

export function AnalyticsFeatureStage() {
  const loop = useFeatureLoop(1000, 4, false, 3);
  return <div {...loop.props} data-feature="2" className="feature-analytics">
    <div className="feature-stage-heading"><span>SignalScore · 30-day window</span><span className="feature-live" aria-hidden="true"><i />Evaluation <time>0:0{loop.step + 1}</time></span></div>
    <p className="feature-stage-subtitle">Precision against your team’s human review.</p>
    <div className="feature-desktop feature-desktop-analytics aspect-[16/10]" role="img" aria-label="Illustrative evaluation analytics: Signal Score 84 percent, 120 reviewed signals, and an agreed 80 percent threshold. Ten bars show example review windows, not customer results.">
      <div aria-hidden="true">
        <div className="feature-window feature-window-analytics">
          <WindowChrome />
          <div className="feature-analytics-layout">
            <aside className="feature-mini-sidebar"><SioonaMark solid className="size-4" /><span>Overview</span><span data-selected="true">Evaluation</span><span>Taxonomy</span></aside>
            <div className="feature-analytics-body">
              <div className="feature-mini-heading">Evaluation<span className="feature-filter">Last 30 days<CaretDown size={9} /><span className="feature-filter-menu"><span>Last 7 days</span><strong>✓ Last 30 days</strong><span>All time</span></span></span></div>
              <div className="feature-kpis">{[["Signal Score", "84%"], ["Reviewed", "120"], ["Threshold", "80%"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
              <div className="feature-chart">{chartBars.map((height, index) => <span key={index} className="transition-[height,transform] duration-500 ease-out" style={{ height: `${loop.step < 2 ? height : alternateBars[index]}%` }} />)}</div>
              <div className="feature-chart-legend"><span><i />Confirmed correct</span><span><i />Human reviewed</span></div>
            </div>
          </div>
        </div>
        <ReviewerCursor />
      </div>
    </div>
    <StaticFallback />
  </div>;
}

export function EvidenceFeatureStage() {
  const loop = useFeatureLoop();
  return <div {...loop.props} data-feature="3" className="feature-evidence" role="group" aria-label="Illustrative customer quote and reviewer context">
  <div className="feature-transcript h-[212px]">
    <div className="feature-evidence-bubble baby-grok-bot-entry-enter rounded-2xl px-3 py-2 text-[14px] leading-5 tracking-[-0.15px]">
      <p>“Honestly, I’m <mark>thinking about moving my account</mark> somewhere else.”</p>
    </div>
    <div className="feature-context-bubble baby-grok-bot-entry-enter rounded-2xl px-3 py-2 text-[14px] leading-5 tracking-[-0.15px]">
      <p>Match the exact quote to the saved taxonomy. Your team records the verdict.</p>
    </div>
    <p className="feature-context-caption baby-grok-bot-entry-enter"><span>Reviewer context</span><SignalTypeChip type="retention" /></p>
  </div><StaticFallback /></div>;
}

const signalPills = [
  { label: "Retention", status: "Needs review", tone: "retention", Icon: RetentionIcon },
  { label: "Lead", status: "Buying intent", tone: "lead", Icon: LeadIcon },
  { label: "Upsell", status: "Expansion", tone: "upsell", Icon: UpsellIcon },
  { label: "Review", status: "Human verdict", tone: "review", Icon: ListChecks },
];

export function SignalPillStage() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const loop = useFeatureLoop(2200, 4, hovered !== null || focused !== null);
  const active = focused ?? hovered ?? loop.step;
  return <div {...loop.props} data-feature="4" className="feature-pill-stage">
    <div className="avatar-row" role="group" aria-label="Explore example signal types">
      {signalPills.map(({ label, status, tone, Icon }, index) => <button key={label} type="button" className="feature-signal-pill" data-tone={tone} data-open={active === index} aria-pressed={active === index} aria-label={`${label}: ${status}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setFocused(index)} onBlur={() => setFocused(null)} onClick={() => setFocused(index)}>
        <Icon className="feature-pill-icon" aria-hidden /><span className="avatar-row__spread" aria-hidden="true"><span className="avatar-row__label"><strong>{label}</strong><span>{status}</span></span></span>
      </button>)}
    </div>
    <StaticFallback />
  </div>;
}

const FILES = [
  { name: "intercom-export.json", size: "2.4 MB" },
  { name: "whatsapp-chat.txt", size: "860 KB" },
  { name: "weekly-chats.csv", size: "1.1 MB" },
];

/** Three files "upload": progress bars grow once in view, then a check appears. */
export function UploadVisual() {
  return (
    <m.ul
      data-reveal
      className="flex flex-col gap-2 rounded-panel border border-dashed border-sio-border-strong p-3 transition-transform duration-200 ease-sio group-hover:translate-x-0.5"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.25 } } }}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
    >
      {FILES.map((file) => (
        <m.li
          data-nojs-show
          key={file.name}
          variants={{
            hidden: { opacity: 1, y: 0 },
            visible: { opacity: 1, y: 0, transition: { duration: duration.base, ease } },
          }}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center justify-between gap-3 text-label-13">
            <span className="min-w-0 truncate font-mono text-sio-fg-base" translate="no">
              {file.name}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-sio-fg-muted">
              <span className="tabular">{file.size.replace(" ", "\u00a0")}</span>
              <m.span
                data-nojs-show
                className="text-sio-status-success-accent"
                variants={{
                  hidden: { opacity: 0, scale: 0.7 },
                  visible: { opacity: 1, scale: 1, transition: { duration: duration.fast, ease, delay: 1 } },
                }}
              >
                <CheckCircle size={14} weight="bold" aria-label="Uploaded" />
              </m.span>
            </span>
          </div>
          <span className="h-1 overflow-hidden rounded-full bg-sio-bg-muted">
            <m.span
              data-nojs-show
              className="block h-full origin-left rounded-full bg-sio-fg-base"
              variants={{
                hidden: { scaleX: 0 },
                visible: { scaleX: 1, transition: { duration: 1, ease } },
              }}
            />
          </span>
        </m.li>
      ))}
    </m.ul>
  );
}

/** Mini Signal Score meter: fill grows once in view; threshold tick stays put. */
export function ScoreMeter({ value, threshold }: { value: number; threshold: number }) {
  return (
    <div className="transition-transform duration-200 ease-sio group-hover:translate-x-0.5">
      <p className="tabular text-heading-32 text-sio-fg-base">{value}%</p>
      <div className="relative mt-3 h-2 rounded-full bg-sio-bg-muted">
        <m.div
          data-reveal
          className="h-full origin-left rounded-full bg-sio-status-success-accent"
          style={{ width: `${value}%` }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={viewport}
          transition={{ duration: 1.1, ease, delay: stagger.loose }}
        />
        <span
          aria-hidden
          className="absolute -top-1 h-4 w-px bg-sio-fg-base"
          style={{ left: `${threshold}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-label-12 text-sio-fg-muted">
        <span>Illustrative</span>
        <span className="tabular">Go at {threshold}%</span>
      </div>
    </div>
  );
}
