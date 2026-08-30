import { signalChipClass } from "@/components/SignalScoreChip";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  signalStatusDot,
  type SignalStatusDotState,
} from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalStatusProps = {
  signal: Pick<Signal, "status" | "feedback">;
  className?: string;
  /**
   * `dot` — bare StatusDot (default).
   * `pill` — queue Status column: StatusDot inside `signalChipClass` (Score/Type shell).
   * `chip` — review-well header chip (same shell as Feedback / Ground Truth).
   */
  variant?: "dot" | "pill" | "chip";
};

/** Class literals here so Tailwind content scan picks them up. */
const STATUS_CHIP: Record<SignalStatusDotState, string> = {
  QUEUED: "bg-sio-bg-muted text-sio-fg-muted",
  READY: "bg-sio-status-success-bg text-sio-status-success-fg",
  ERROR: "bg-sio-status-danger-bg text-sio-status-danger-fg",
  BUILDING: "bg-sio-status-warning-bg text-sio-status-warning-fg",
  CANCELED: "bg-sio-bg-muted text-sio-fg-muted",
};

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
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-label-12 font-medium",
          STATUS_CHIP[state],
          className,
        )}
        translate="no"
      >
        {label}
      </span>
    );
  }

  if (variant === "pill") {
    return (
      <span
        className={cn(signalChipClass, "min-w-0", className)}
        translate="no"
      >
        <StatusDot className="min-w-0" label state={state}>
          {label}
        </StatusDot>
      </span>
    );
  }

  return (
    <StatusDot className={className} label state={state}>
      {label}
    </StatusDot>
  );
}
