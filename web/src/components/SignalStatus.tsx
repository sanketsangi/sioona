import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
import { signalChipClass } from "@/components/SignalScoreChip";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  signalStatusDot,
  signalStatusMarkClass,
  type SignalStatusDotState,
} from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalStatusProps = {
  signal: Pick<Signal, "status" | "feedback">;
  className?: string;
  /**
   * `dot` — queue / list StatusDot (default).
   * `chip` — review-well header chip (same shell as Feedback / Ground Truth).
   */
  variant?: "dot" | "chip";
};

type SignalStatusChipState = SignalStatusDotState | "ALL";

type SignalStatusChipProps = {
  state: SignalStatusChipState;
  label: string;
  /** Optional keep-set / filter count after the label. */
  count?: number;
  className?: string;
};

/** Class literals here so Tailwind content scan picks them up. */
const STATUS_CHIP: Record<SignalStatusDotState, string> = {
  QUEUED: "bg-sio-bg-muted text-sio-fg-muted",
  READY: "bg-sio-status-success-bg text-sio-status-success-fg",
  ERROR: "bg-sio-status-danger-bg text-sio-status-danger-fg",
  BUILDING: "bg-sio-status-warning-bg text-sio-status-warning-fg",
  CANCELED: "bg-sio-bg-muted text-sio-fg-muted",
};

const ALL_MARK = "bg-sio-bg-muted text-sio-fg-base";

function statusChipMarkClass(state: SignalStatusChipState): string {
  if (state === "ALL") return ALL_MARK;
  return signalStatusMarkClass(state);
}

/**
 * Queue status chrome — same Type-chip shell (`signalChipClass` + mark fill),
 * label + optional count, no icons.
 */
export function SignalStatusChip({
  state,
  label,
  count,
  className,
}: SignalStatusChipProps) {
  return (
    <span
      className={cn(
        signalChipClass,
        "leading-none",
        statusChipMarkClass(state),
        className,
      )}
      translate="no"
    >
      <span className="translate-y-px whitespace-nowrap text-label-12 font-medium leading-none">
        {label}
      </span>
      {count != null ? (
        <span className="translate-y-px tabular text-label-12 font-medium leading-none">
          {count}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Insights review status chrome — Pending / Correct / Incorrect / Partially Correct / Acted.
 * Mapping stays in `format.ts` (`signalStatusDot`); do not re-wire StatusDot in views.
 */
export function SignalStatus({
  signal,
  className,
  variant = "dot",
}: SignalStatusProps) {
  const { state, label } = signalStatusDot(signal);

  if (variant === "chip") {
    return (
      <InsightsReviewStatusChip className={cn(STATUS_CHIP[state], className)}>
        {label}
      </InsightsReviewStatusChip>
    );
  }

  return (
    <StatusDot className={className} label state={state}>
      {label}
    </StatusDot>
  );
}
