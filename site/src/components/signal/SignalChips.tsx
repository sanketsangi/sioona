import { CheckCircle, Warning, XCircle } from "@phosphor-icons/react/ssr";
import type { ComponentType } from "react";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";

export type SignalType = "lead" | "retention" | "upsell";
export type SignalState = "pending" | "correct" | "incorrect" | "partial" | "acted";

export const signalTypeLabel: Record<SignalType, string> = {
  lead: "Lead",
  retention: "Retention",
  upsell: "Upsell",
};

const TYPE_ICON: Record<SignalType, ComponentType<{ className?: string }>> = {
  lead: LeadIcon,
  retention: RetentionIcon,
  upsell: UpsellIcon,
};

/* Literal class names so the Tailwind scanner finds them. */
const TYPE_CLASS: Record<SignalType, string> = {
  lead: "bg-sio-signal-lead-bg text-sio-fg-link",
  retention: "bg-sio-signal-retention-bg text-sio-status-warning-fg",
  upsell: "bg-sio-signal-upsell-bg text-sio-status-success-fg",
};

const CHIP_SHELL =
  "inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full whitespace-nowrap text-[12px]/[24px] font-medium tabular-nums";

/** Type chip: icon + text label, same wash as the product's SignalTypeChip. */
export function SignalTypeChip({ type, className = "" }: { type: SignalType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={`${CHIP_SHELL} py-0.5 pl-1.5 pr-2.5 ${TYPE_CLASS[type]} ${className}`}>
      <Icon className="size-3.5 shrink-0" />
      <span>{signalTypeLabel[type]}</span>
    </span>
  );
}

type ScoreBand = "good" | "warning" | "stop";

function scoreBand(score: number): ScoreBand {
  if (score > 0.9) return "good";
  if (score >= 0.5) return "warning";
  return "stop";
}

const BAND_CLASS: Record<ScoreBand, string> = {
  good: "text-sio-status-success-accent",
  warning: "text-sio-status-warning-accent",
  stop: "text-sio-status-danger-accent",
};

/** Score chip: band icon + tabular digits on a hairline ring. */
export function SignalScoreChip({ score, className = "" }: { score: number; className?: string }) {
  const band = scoreBand(score);
  const Icon = band === "good" ? CheckCircle : band === "warning" ? Warning : XCircle;
  const value = Math.round(score * 100);
  return (
    <span
      className={`${CHIP_SHELL} bg-sio-bg-base px-2 text-sio-fg-base ring-chip ${className}`}
      aria-label={`Detection score ${value} out of 100`}
    >
      <Icon size={14} weight="bold" className={BAND_CLASS[band]} aria-hidden />
      <span className="tabular">{value}</span>
    </span>
  );
}

export const signalStateLabel: Record<SignalState, string> = {
  pending: "Pending",
  correct: "Correct",
  incorrect: "Incorrect",
  partial: "Partially Correct",
  acted: "Acted",
};

const STATE_CHIP: Record<SignalState, string> = {
  pending: "bg-sio-status-pending-bg text-sio-status-pending-fg",
  correct: "bg-sio-status-success-bg text-sio-status-success-fg",
  incorrect: "bg-sio-status-danger-bg text-sio-status-danger-fg",
  partial: "bg-sio-status-warning-bg text-sio-status-warning-fg",
  acted: "bg-sio-bg-muted text-sio-fg-subtle",
};

const STATE_DOT: Record<SignalState, string> = {
  pending: "bg-sio-status-pending-accent",
  correct: "bg-sio-status-success-accent",
  incorrect: "bg-sio-status-danger-accent",
  partial: "bg-sio-status-warning-accent",
  acted: "bg-sio-fg-faint",
};

const STATE_DOT_TEXT: Record<SignalState, string> = {
  pending: "text-sio-status-pending-fg",
  correct: "text-sio-status-success-fg",
  incorrect: "text-sio-status-danger-fg",
  partial: "text-sio-status-warning-fg",
  acted: "text-sio-fg-muted",
};

/** Review status. `dot` is the queue row treatment, `chip` is the review header. */
export function SignalStatus({
  state,
  variant = "dot",
  className = "",
}: {
  state: SignalState;
  variant?: "dot" | "chip";
  className?: string;
}) {
  if (variant === "chip") {
    return (
      <span
        className={`${CHIP_SHELL} px-2 text-[12px]/[24px] ${STATE_CHIP[state]} ${className}`}
      >
        {signalStateLabel[state]}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-label-13 font-medium ${STATE_DOT_TEXT[state]} ${className}`}
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATE_DOT[state]}`} />
      <span className="truncate">{signalStateLabel[state]}</span>
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Customer identity: initials avatar plus truncated name. */
export function SignalUser({
  name,
  size = 28,
  showName = true,
  className = "",
}: {
  name: string;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-sio-bg-muted text-sio-fg-subtle ring-chip"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {initials(name)}
      </span>
      {showName ? (
        <span className="min-w-0 truncate text-label-13 font-medium text-sio-fg-base" translate="no">
          {name}
        </span>
      ) : null}
    </span>
  );
}
