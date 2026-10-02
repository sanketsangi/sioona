"use client";

import { m, type Variants } from "framer-motion";
import { distance, duration, ease, viewport } from "@/lib/motion";
import type { SignalType } from "@/components/signal/SignalChips";

const HIGHLIGHT: Record<SignalType, string> = {
  lead: "bg-sio-signal-lead-bg ring-1 ring-sio-status-pending-accent",
  retention: "bg-sio-signal-retention-bg ring-1 ring-sio-signal-retention-accent",
  upsell: "bg-sio-signal-upsell-bg ring-1 ring-sio-signal-upsell-accent",
};

type Props = {
  type: SignalType;
  before: string;
  quote: string;
  after?: string;
  reason: string;
  delay?: number;
};

/** Mini conversation: bubble rises in, the quote highlights, then the reason appears. */
export function SignalSnippet({ type, before, quote, after = "", reason, delay = 0 }: Props) {
  const container: Variants = {
    hidden: {},
    visible: { transition: { delayChildren: delay, staggerChildren: 0.35 } },
  };
  const rise: Variants = {
    hidden: { opacity: 0, y: distance.sm },
    visible: { opacity: 1, y: 0, transition: { duration: duration.base, ease } },
  };
  const sweep: Variants = {
    hidden: { scaleX: 0, opacity: 0 },
    visible: { scaleX: 1, opacity: 1, transition: { duration: duration.slow, ease } },
  };

  return (
    <m.div
      data-reveal
      className="flex flex-col gap-3 rounded-panel bg-sio-bg-subtle p-3"
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
    >
      <m.div variants={rise} className="chat-bubble chat-bubble--customer self-end" style={{ maxWidth: "92%" }}>
        {before}
        <span className="relative inline-block">
          <m.span
            aria-hidden
            variants={sweep}
            className={`absolute -inset-x-0.5 inset-y-0 origin-left rounded-[3px] ${HIGHLIGHT[type]}`}
          />
          <span className="relative">{quote}</span>
        </span>
        {after}
      </m.div>
      <m.div variants={rise} className="rounded-panel border border-sio-border-base bg-sio-bg-base p-2.5">
        <p className="eyebrow">Why This Fired</p>
        <p className="mt-1 text-label-13 text-sio-fg-subtle">
          <span className="font-medium text-sio-fg-base">“{quote}”</span> · {reason}
        </p>
      </m.div>
    </m.div>
  );
}
