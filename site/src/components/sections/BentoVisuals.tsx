"use client";

import { m } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { duration, ease, stagger, viewport } from "@/lib/motion";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageVisible } from "@/lib/usePageVisible";
import { ListChecks, CaretDown } from "@phosphor-icons/react/ssr";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { SignalScoreChip, SignalTypeChip, SignalUser, type SignalType } from "@/components/signal/SignalChips";

export const FeaturePlaybackContext = createContext(true);

/** SSR stays settled; observers, media preferences, and tab visibility gate all work. */
function useFeatureLoop(period = 0, steps = 1, pinned = false, settled = 0) {
  const playbackEnabled = useContext(FeaturePlaybackContext);
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
  const running = playbackEnabled && !reduced && inView && pageVisible && !pinned;
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

function FeatureCursorArrow() {
  return (<svg className="feature-handover-arrow" fill="none" height="18" viewBox="0 0 17 18" width="17">
            <path d="M15.5036 3.11002L12.5357 15.4055C12.2666 16.5204 10.7637 16.7146 10.22 15.7049L7.4763 10.6094L2.00376 8.65488C0.915938 8.26638 0.891983 6.73663 1.96711 6.31426L13.8314 1.65328C14.7729 1.28341 15.741 2.12672 15.5036 3.11002ZM7.56678 10.6417L7.56645 10.6416C7.56656 10.6416 7.56667 10.6416 7.56678 10.6417L7.65087 10.4062L7.56678 10.6417Z" fill="currentColor" stroke="var(--sio-bg-base)" strokeWidth="1.5" />
          </svg>);
}

function ReviewerCursor() {
  return <span className="feature-cursor" aria-hidden="true"><FeatureCursorArrow /><span className="feature-handover-name feature-reviewer-name inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium leading-none">You</span></span>;
}

/** Synthetic, display-only illustrations; these controls do not mutate a workspace. */
export function ShadowFeatureStage() {
  const loop = useFeatureLoop(1800, 4, false, 3);
  return <div {...loop.props} data-feature="0" className="feature-shadow">
    <div className="feature-stage-heading"><span>Shadow Mode</span><span className="feature-badge-swap" aria-label="Human-controlled Shadow Mode"><span className="feature-detect-badge"><i className="feature-spinner" />Detecting signal</span><span className="feature-dot-badge" data-tone="warning"><i />You’re in control</span></span></div>
    <p className="feature-stage-subtitle">Your team reviews. Nothing is sent from Sioona.</p>
    <div className="feature-desktop feature-desktop-shadow aspect-[16/10]" role="img" aria-label="Illustrative conversation in a skeleton review workspace: the customer says they will close their account, and the reviewer asks what has changed. Nothing is sent from Sioona.">
      <div aria-hidden="true">
        <div className="feature-window feature-window-shadow">
          <div className="feature-skeleton-chrome"><span /><span /><span /></div>
          <div className="feature-skeleton-address"><i /></div>
          <div className="feature-skeleton-workspace">
            <aside className="feature-skeleton-sidebar">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</aside>
            <div className="feature-skeleton-content">
              <div className="feature-skeleton-toolbar"><i /><i /></div>
              <div className="feature-skeleton-columns">
                <div className="feature-skeleton-queue">{Array.from({ length: 6 }, (_, index) => <div key={index} data-selected={index === 1}><i /><span /><b /></div>)}</div>
                <div className="feature-skeleton-detail">
                  <div className="feature-skeleton-summary"><i /><i /><i /></div>
                  <div className="feature-review-conversation">
                    <p className="feature-review-message">“<mark>I’ll close my account</mark> and move my savings elsewhere.”</p>
                    <p className="feature-review-reply">“I’m sorry to hear that. Can you tell me what’s changed?”</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <span className="feature-handover-cursor" aria-hidden="true">
          <FeatureCursorArrow />
          <span className="feature-handover-name inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium leading-none">You</span>
        </span>
      </div>
    </div>
    <StaticFallback />
  </div>;
}

const chartBars = [34, 48, 42, 63, 56, 72, 66, 82, 76, 88];
const alternateBars = [52, 38, 59, 47, 74, 61, 84, 71, 91, 80];
const filterOptions = ["Last 7 days", "Last 30 days", "All time"];

export function AnalyticsFeatureStage() {
  const loop = useFeatureLoop(1000, 4, false, 3);
  const activeFilterIndex = loop.step === 0 ? 0 : loop.step === 3 ? 2 : 1;
  return <div {...loop.props} data-feature="2" className="feature-analytics">
    <div className="feature-stage-heading"><span className="feature-analytics-title">SignalScore <span>· 30-day window</span></span><span className="feature-live" aria-hidden="true"><i />Evaluation <time>0:0{loop.step + 1}</time></span></div>
    <div className="feature-desktop feature-desktop-analytics aspect-[16/10]" role="img" aria-label="Illustrative evaluation dashboard: Signal Score 84 percent, 120 reviewed signals, an 80 percent threshold, a Last 30 days filter, and ten example bars. These are not customer results.">
      <div aria-hidden="true">
        <div className="feature-window feature-window-analytics">
          <div className="feature-skeleton-chrome"><span /><span /><span /></div>
          <div className="feature-skeleton-address"><i /></div>
          <div className="feature-skeleton-workspace feature-skeleton-analytics">
            <aside className="feature-skeleton-sidebar">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</aside>
            <div className="feature-skeleton-analytics-body">
              <div className="feature-skeleton-analytics-toolbar">
                <i />
                <div className="feature-filter feature-analytics-period">
                  Last 30 days<CaretDown size={9} />
                  <span className="feature-filter-menu">
                    {filterOptions.map((opt, i) => {
                      const isActive = activeFilterIndex === i;
                      return (
                        <span key={opt} data-active={isActive}>
                          {isActive ? `✓ ${opt}` : opt}
                        </span>
                      );
                    })}
                  </span>
                </div>
              </div>
              <div className="feature-kpis">{[["Signal Score", "84%"], ["Reviewed", "120"], ["Threshold", "80%"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
              <div className="feature-chart">{chartBars.map((height, index) => <span key={index} style={{ transform: `scaleY(${(loop.step < 2 ? height : alternateBars[index]) / 100})` }} />)}</div>
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
  <div className="feature-transcript">
    <div className="feature-evidence-bubble baby-grok-bot-entry-enter rounded-panel border border-sio-border-base bg-sio-bg-base p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SignalUser name="Maya Rossi" size={24} />
        <div className="flex shrink-0 items-center gap-1.5">
          <SignalTypeChip type="retention" />
          <SignalScoreChip score={0.92} />
        </div>
      </div>
      <p className="text-[14px] leading-5 text-sio-fg-base">
        “Honestly, I’m{" "}
        <mark className="rounded-[3px] bg-sio-signal-retention-bg px-1 text-sio-fg-base ring-1 ring-sio-signal-retention-accent">
          thinking about moving my account
        </mark>{" "}
        somewhere else.”
      </p>
    </div>
    <div className="feature-context-bubble baby-grok-bot-entry-enter rounded-panel border border-sio-border-base bg-sio-bg-base p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-label-12">
        <span className="font-medium text-sio-fg-base">Suggested Next Action</span>
        <span className="rounded-full bg-sio-signal-retention-bg px-2 py-0.5 text-[11px] font-medium text-sio-status-warning-fg">Human Review</span>
      </div>
      <p className="mb-2 text-label-13 text-sio-fg-subtle">Schedule retention outreach before plan renewal.</p>
      <div className="flex items-center justify-between border-t border-sio-border-muted pt-1.5 text-label-12">
        <span className="flex items-center gap-1.5 text-sio-fg-muted">
          <span className="keycap h-5 min-w-[20px] px-1 text-[11px]">C</span>
          <span>Correct</span>
        </span>
        <span className="flex items-center gap-1.5 font-medium text-sio-fg-base">
          <span className="keycap h-5 min-w-[20px] border-sio-bg-inverse bg-sio-bg-inverse px-1 text-[11px] text-sio-fg-on-color">A</span>
          <span>Mark Acted</span>
        </span>
      </div>
    </div>
    <p className="feature-context-caption baby-grok-bot-entry-enter"><span>Reviewer context</span><SignalTypeChip type="retention" /></p>
  </div><StaticFallback /></div>;
}

const signalPills = [
  { label: "Retention", status: "Needs review", activity: "Reviewing retention…", tone: "retention", Icon: RetentionIcon },
  { label: "Lead", status: "Buying intent", activity: "Reviewing buying intent…", tone: "lead", Icon: LeadIcon },
  { label: "Upsell", status: "Expansion", activity: "Reviewing expansion…", tone: "upsell", Icon: UpsellIcon },
  { label: "Review", status: "Human verdict", activity: "Awaiting human review…", tone: "review", Icon: ListChecks },
];

const signalPreviews: { name: string; type: SignalType; score: number; snippet: string }[] = [
  { name: "Maya Rossi", type: "retention", score: 0.92, snippet: "“Honestly, I’m thinking about moving my account…”" },
  { name: "Priya Nair", type: "lead", score: 0.88, snippet: "“Do you have accounts for a small team?”" },
  { name: "Sam Taylor", type: "upsell", score: 0.95, snippet: "“I hit the cap every week. Can I get higher limits?”" },
  { name: "Alex Chen", type: "retention", score: 0.91, snippet: "“120 verified customer moments awaiting action…”" },
];

export function SignalPillStage() {
  const [hovered, setHovered] = useState<number | null>(null);
  const hoverPosition = useRef<{ x: number; y: number } | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const loop = useFeatureLoop(2200, 4, hovered !== null || focused !== null);
  const active = focused ?? hovered ?? loop.step;
  const preview = signalPreviews[active % signalPreviews.length];
  return <div {...loop.props} data-feature="4" className="feature-pill-stage" onMouseLeave={() => { hoverPosition.current = null; setHovered(null); }}>
    <div className="avatar-row" role="group" aria-label="Explore example signal types">
      {signalPills.map(({ label, status, activity, tone, Icon }, index) => <button key={label} type="button" className="feature-signal-pill" data-tone={tone} data-open={active === index} aria-pressed={active === index} aria-label={`${label}: ${status}`} onMouseEnter={event => {
        // Resizing can dispatch enter events on siblings without user movement.
        // Once inside, select another signal only from a mousemove event.
        if (hoverPosition.current) return;
        hoverPosition.current = { x: event.clientX, y: event.clientY };
        setHovered(index);
      }} onMouseMove={event => {
        const previous = hoverPosition.current;
        if (previous && previous.x === event.clientX && previous.y === event.clientY) return;
        hoverPosition.current = { x: event.clientX, y: event.clientY };
        setHovered(index);
      }} onFocus={() => setFocused(index)} onBlur={() => setFocused(null)} onClick={() => setFocused(index)}>
        <Icon className="feature-pill-icon" aria-hidden /><span className="avatar-row__spread" aria-hidden="true"><span className="avatar-row__label"><span className="feature-activity-dots"><i /><i /><i /></span><span>{activity}</span></span></span>
      </button>)}
    </div>
    <div className="feature-signal-preview w-full max-w-[340px] rounded-panel border border-sio-border-base bg-sio-bg-base p-3 shadow-sm transition-[opacity,transform] duration-200 ease-sio">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <SignalUser name={preview.name} size={22} />
        <div className="flex shrink-0 items-center gap-1.5">
          <SignalTypeChip type={preview.type} />
          <SignalScoreChip score={preview.score} />
        </div>
      </div>
      <p className="truncate text-label-13 text-sio-fg-subtle">{preview.snippet}</p>
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
