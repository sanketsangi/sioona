"use client";

import { m, useInView, useReducedMotion } from "framer-motion";
import { Eye, PauseCircle, PlayCircle } from "@phosphor-icons/react/ssr";
import { Fragment, useContext, useRef, useState } from "react";
import Link from "@/components/navigation/GuardedLink";
import { HeroPreviewEntered } from "@/components/sections/HeroPreview";
import { usePageVisible } from "@/lib/usePageVisible";
import {
  SignalScoreChip,
  SignalStatus,
  SignalTypeChip,
  SignalUser,
  type SignalState,
  type SignalType,
} from "@/components/signal/SignalChips";
import { STEP, useInsightsScript } from "@/components/mocks/useInsightsScript";
import { duration, ease } from "@/lib/motion";

type Seg = { text: string; quote?: boolean };
type Message = { from: "customer" | "agent"; segs: Seg[] };

const MESSAGES: Message[] = [
  {
    from: "customer",
    segs: [{ text: "Hi, I’ve been with you for three years. The new fee tiers are higher than I expected." }],
  },
  {
    from: "agent",
    segs: [{ text: "Thanks for flagging this. Can you tell me what’s behind the question?" }],
  },
  {
    from: "customer",
    segs: [
      { text: "Honestly, if I can’t find a better plan this week, " },
      { text: "I’ll close my account", quote: true },
      { text: " and move my savings elsewhere." },
    ],
  },
];

const OFFSETS = (() => {
  let total = 0;
  return MESSAGES.map((message) => {
    const start = total;
    total += message.segs.reduce((sum, seg) => sum + seg.text.length, 0);
    return start;
  });
})();
const TOTAL_CHARS = MESSAGES.reduce((sum, message) => sum + message.segs.reduce((s, seg) => s + seg.text.length, 0), 0);

const ROW_HEIGHT = 64;

type QueueRow = { name: string; snippet: string; type: SignalType; state: SignalState };

const EXISTING_ROWS: QueueRow[] = [
  { name: "Sam Taylor", snippet: "Can I get higher limits? I hit the cap every week.", type: "upsell", state: "correct" },
  { name: "Priya Nair", snippet: "Do you have accounts for a small team?", type: "lead", state: "pending" },
  { name: "Daniel Okafor", snippet: "Please pause my plan until next quarter.", type: "retention", state: "acted" },
];

function TypedText({ segs, start, count, highlight }: { segs: Seg[]; start: number; count: number; highlight: boolean }) {
  const starts = segs.reduce<number[]>((acc, _seg, index) => {
    acc.push(index === 0 ? start : acc[index - 1] + segs[index - 1].text.length);
    return acc;
  }, []);
  return (
    <>
      {segs.map((seg, index) => {
        const typedLen = Math.max(0, Math.min(seg.text.length, count - starts[index]));
        const typed = seg.text.slice(0, typedLen);
        const rest = seg.text.slice(typedLen);
        const body = (
          <>
            <span>{typed}</span>
            <span className="opacity-0">{rest}</span>
          </>
        );
        if (!seg.quote) return <Fragment key={index}>{body}</Fragment>;
        return (
          <span key={index} className="relative whitespace-nowrap">
            <m.span
              aria-hidden
              className="absolute -inset-x-1 inset-y-0 origin-left rounded-[3px] bg-sio-signal-retention-bg ring-1 ring-sio-signal-retention-accent"
              initial={false}
              animate={{ scaleX: highlight ? 1 : 0, opacity: highlight ? 1 : 0 }}
              transition={{ duration: duration.slow, ease }}
            />
            <span className="relative">{body}</span>
          </span>
        );
      })}
    </>
  );
}

const TABS = ["Pending", "Needs Follow-up", "Done"] as const;

/**
 * Motion and reduced-motion frames are both in the server HTML.
 * `motion-safe` picks one before paint, so reduced motion never starts on the idle frame.
 */
export function InsightsMock({ previewHeader = false }: { previewHeader?: boolean }) {
  return (
    <>
      <div className="hidden motion-safe:block">
        <InsightsDemo reduced={false} previewHeader={previewHeader} />
      </div>
      <div className="motion-safe:hidden">
        <InsightsDemo reduced previewHeader={previewHeader} />
      </div>
    </>
  );
}

function InsightsDemo({ reduced, previewHeader }: { reduced: boolean; previewHeader: boolean }) {
  const [userPaused, setUserPaused] = useState(true);
  const [selectedStep, setSelectedStep] = useState<number | null>(STEP.why);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: "some", once: false, margin: "0px" });
  const previewEntered = useContext(HeroPreviewEntered);
  const pageVisible = usePageVisible();
  const systemReduced = useReducedMotion();
  const running = !userPaused && inView && previewEntered && pageVisible && !reduced && systemReduced !== true;
  const script = useInsightsScript({ totalChars: TOTAL_CHARS, running, reduced: reduced || systemReduced === true });
  const step = selectedStep ?? script.step;
  const chars = selectedStep === null ? script.chars : TOTAL_CHARS;

  const reviewing = step >= STEP.rowIn && step < STEP.reset;
  const showWhy = step >= STEP.why && step < STEP.reset;
  const showChips = step >= STEP.chips && step < STEP.reset;
  const showAction = step >= STEP.correct && step < STEP.reset;
  const state: SignalState = step >= STEP.acted ? "acted" : step >= STEP.correct ? "correct" : "pending";
  const activeTab = state === "pending" ? 0 : state === "correct" ? 1 : 2;
  const counts = [
    3 + (reviewing && state === "pending" ? 1 : 0),
    2 + (reviewing && state === "correct" ? 1 : 0),
    9 + (reviewing && state === "acted" ? 1 : 0),
  ];
  const pressed = step === STEP.acted;
  const t = { duration: duration.base, ease };

  const playbackControl = (
          <button
            type="button"
            onClick={() => { setSelectedStep(null); setUserPaused((value) => !value); }}
            aria-pressed={!userPaused}
            aria-label={userPaused ? "Play Demo Animation" : "Pause Demo Animation"}
            className={previewHeader
              ? `preview-chrome-action demo-playback-control inline-flex w-7 h-7 items-center justify-center p-0 ${reduced ? "hidden" : ""}`
              : `btn-tertiary size-11 !px-0 md:size-8 ${reduced ? "hidden" : ""}`}
          >
            {userPaused ? <PlayCircle size={20} aria-hidden /> : <PauseCircle size={20} aria-hidden />}
          </button>
  );

  return (
    <figure ref={ref} className="relative m-0" data-demo-running={running} data-demo-step={step}>
      {previewHeader ? (
        <div className="preview-chrome-header">
          <div className="preview-chrome-header-lead">
            <div className="preview-traffic-lights-spacer" aria-hidden="true">
              <span className="preview-window-dots"><span /><span /><span /></span>
            </div>
          </div>
          <div className="preview-chrome-header-actions">{playbackControl}</div>
        </div>
      ) : null}
      <figcaption className="sr-only">Illustrative review workspace: a customer says “I’ll close my account”. Sioona highlights the source text as a retention signal. A human reviewer confirms it and marks it acted on. Suggested follow-ups are display-only; no message is sent.</figcaption>
      <nav aria-label="Illustrative pilot workflow" className="mb-3 flex flex-wrap items-center gap-2">
        {[[STEP.why, "1. Source quote"], [STEP.chips, "2. Human review"], [STEP.correct, "3. Approved draft"]].map(([frame, label]) => (
          <button key={frame} type="button" aria-pressed={selectedStep === frame}
            className="min-h-11 rounded-full border border-sio-border-subtle bg-sio-bg-muted px-2.5 py-0.5 text-label-12 text-sio-fg-subtle hover:text-sio-fg-base aria-pressed:border-sio-border-strong aria-pressed:font-medium aria-pressed:text-sio-fg-base focus-visible:ring-2 focus-visible:ring-sio-border-strong md:min-h-6"
            onClick={() => { setUserPaused(true); setSelectedStep(Number(frame)); }}>{label}</button>
        ))}
        <Link href="/contact" className="inline-flex min-h-11 items-center rounded-full border border-sio-border-subtle bg-sio-bg-muted px-2.5 py-0.5 text-label-12 text-sio-fg-base hover:underline md:min-h-6">4. Request a pilot →</Link>
      </nav>
      <p role="status" className="sr-only">{selectedStep === STEP.correct ? "Illustrative draft approved. Nothing sent." : selectedStep === STEP.chips ? "Illustrative human review. Review the source before deciding." : "Illustrative source quote: I’ll close my account."}</p>
      <div
        className="panel shadow-mock overflow-hidden"
      >
        <div className="flex h-11 items-center justify-between gap-3 border-b border-sio-border-base bg-sio-bg-subtle/40 px-3 sm:px-4">
          <div aria-hidden className="flex min-w-0 items-center gap-2.5">
            <span className="text-heading-16 font-semibold text-sio-fg-base">Insights</span>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-sio-border-base bg-sio-bg-muted px-2.5 text-[11px] font-medium text-sio-fg-subtle">
              <Eye size={13} weight="regular" aria-hidden />
              Shadow Mode
            </span>
          </div>
          {previewHeader ? null : playbackControl}
        </div>

        <div aria-hidden className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="border-b border-sio-border-base lg:border-b-0 lg:border-r">
            <div className="flex h-10 items-stretch gap-4 border-b border-sio-border-base px-3 sm:px-4">
              {TABS.map((tab, index) => (
                <span
                  key={tab}
                  className={`relative inline-flex items-center gap-1.5 whitespace-nowrap text-label-13 ${
                    activeTab === index ? "font-medium text-sio-fg-base" : "text-sio-fg-subtle"
                  }`}
                >
                  {tab}
                  <span className="tabular text-label-12 text-sio-fg-subtle">{counts[index]}</span>
                  <m.span
                    className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-sio-fg-base"
                    initial={false}
                    animate={{ scaleX: activeTab === index ? 1 : 0 }}
                    transition={{ duration: duration.fast, ease }}
                  />
                </span>
              ))}
            </div>
            <div className="relative h-[128px] overflow-hidden lg:h-[256px]">
              {EXISTING_ROWS.map((row, index) => (
                <m.div
                  key={row.name}
                  className="absolute inset-x-0 border-b border-sio-border-base"
                  style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                  initial={false}
                  animate={{ y: reviewing ? ROW_HEIGHT : 0 }}
                  transition={t}
                >
                  <QueueRowView row={row} />
                </m.div>
              ))}
              <m.div
                className="absolute inset-x-0 top-0 border-b border-sio-border-base bg-sio-bg-interactive"
                style={{ height: ROW_HEIGHT }}
                initial={false}
                animate={{ opacity: reviewing ? 1 : 0, y: reviewing ? 0 : -16 }}
                transition={t}
              >
                <QueueRowView
                  row={{ name: "Maya Rossi", snippet: "…I’ll close my account and move my savings…", type: "retention", state }}
                  statusOverride={state}
                />
              </m.div>
            </div>
          </div>

          <div className="relative min-h-[360px] p-3 sm:p-4 lg:min-h-[0]">
            <m.div
              className="absolute inset-0 flex items-center justify-center p-6 text-center text-copy-14 text-sio-fg-muted"
              initial={false}
              animate={{ opacity: reviewing ? 0 : 1 }}
              transition={t}
            >
              Select a signal to review.
            </m.div>
            <m.div
              className="flex flex-col gap-3"
              initial={false}
              animate={{ opacity: reviewing ? 1 : 0 }}
              transition={t}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SignalUser name="Maya Rossi" />
                <div className="flex items-center gap-1.5">
                  <m.span
                    initial={false}
                    animate={{ opacity: showChips ? 1 : 0, scale: showChips ? 1 : 0.85 }}
                    transition={t}
                  >
                    <SignalTypeChip type="retention" />
                  </m.span>
                  <m.span
                    initial={false}
                    animate={{ opacity: showChips ? 1 : 0, scale: showChips ? 1 : 0.85 }}
                    transition={{ ...t, delay: showChips ? 0.12 : 0 }}
                  >
                    <SignalScoreChip score={0.92} />
                  </m.span>
                  <span className="grid">
                    {(["pending", "correct", "acted"] as const).map((s) => (
                      <m.span
                        key={s}
                        className="col-start-1 row-start-1 justify-self-end"
                        initial={false}
                        animate={{ opacity: state === s ? 1 : 0, y: state === s ? 0 : -4 }}
                        transition={{ duration: duration.fast, ease }}
                      >
                        <SignalStatus state={s} variant="chip" />
                      </m.span>
                    ))}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {MESSAGES.map((message, index) => {
                  const started = chars > OFFSETS[index];
                  return (
                    <m.div
                      key={index}
                      className={`chat-bubble ${message.from === "customer" ? "chat-bubble--customer self-end" : "chat-bubble--agent self-start"}`}
                      style={{ maxWidth: "88%" }}
                      initial={false}
                      animate={{ opacity: started ? 1 : 0, y: started ? 0 : 8 }}
                      transition={{ duration: duration.fast, ease }}
                    >
                      <TypedText segs={message.segs} start={OFFSETS[index]} count={chars} highlight={showWhy} />
                    </m.div>
                  );
                })}
              </div>

              <m.div
                className="rounded-panel border border-sio-border-base p-3"
                initial={false}
                animate={{ opacity: showWhy ? 1 : 0, y: showWhy ? 0 : 8 }}
                transition={t}
              >
                <p className="eyebrow">Why This Fired</p>
                <p className="mt-1.5 text-copy-14 text-sio-fg-base">
                  <span className="rounded-[3px] bg-sio-signal-retention-bg px-1 text-sio-signal-retention-fg">
                    “I’ll close my account”
                  </span>
                </p>
                <p className="mt-1.5 text-label-13 text-sio-fg-subtle">Customer states they plan to leave.</p>
              </m.div>

              <m.div
                className="flex items-center justify-between gap-3 rounded-panel border border-sio-border-base p-3"
                initial={false}
                animate={{ opacity: showAction ? 1 : 0, y: showAction ? 0 : 8 }}
                transition={t}
              >
                <div className="min-w-0">
                  <p className="eyebrow">{selectedStep === STEP.correct ? "Approved draft · illustrative" : "Suggested Next Action"}</p>
                  <p className="mt-1 truncate text-copy-14 text-sio-fg-base">Offer a fee review call. Nothing sends.</p>
                </div>
                <m.span
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-sio-border-subtle px-2.5 text-label-13 font-medium text-sio-fg-base"
                  initial={false}
                  animate={{ scale: pressed ? 0.95 : 1 }}
                  transition={{ duration: duration.fast, ease }}
                >
                  {selectedStep === STEP.correct ? "Approved · not sent" : "Mark Acted"}
                  <span className="inline-flex size-5 items-center justify-center rounded-[4px] border border-sio-border-strong font-mono text-[11px] text-sio-fg-subtle">
                    A
                  </span>
                </m.span>
              </m.div>
            </m.div>
          </div>
        </div>
      </div>
    </figure>
  );
}

function QueueRowView({ row, statusOverride }: { row: QueueRow; statusOverride?: SignalState }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-3 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <SignalUser name={row.name} size={20} />
        <SignalStatus state={statusOverride ?? row.state} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-label-13 text-sio-fg-subtle">{row.snippet}</p>
        <SignalTypeChip type={row.type} />
      </div>
    </div>
  );
}
