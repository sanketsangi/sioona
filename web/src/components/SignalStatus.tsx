import { StatusDot } from "@/components/ui/StatusDot";
import { signalStatusDot } from "@/lib/format";
import type { Signal } from "@/lib/types";

type SignalStatusProps = {
  signal: Pick<Signal, "status" | "feedback">;
  className?: string;
};

/**
 * Insights review status chrome — Pending / Correct / Incorrect / Partially Correct / Acted.
 * Mapping stays in `format.ts` (`signalStatusDot`); do not re-wire StatusDot in views.
 */
export function SignalStatus({ signal, className }: SignalStatusProps) {
  const { state, label } = signalStatusDot(signal);
  return (
    <StatusDot className={className} label state={state}>
      {label}
    </StatusDot>
  );
}
