import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { signalTypeLabel } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalTypeChipProps = {
  type: SignalType;
  /** Optional keep-set count shown after the type label. */
  count?: number;
  className?: string;
};

const TYPE_CLASS: Record<SignalType, string> = {
  lead: "bg-sio-signal-lead-bg text-sio-fg-link",
  retention: "bg-sio-signal-retention-bg text-sio-status-warning-fg",
  upsell: "bg-sio-signal-upsell-bg text-sio-status-success-fg",
};

/** Production pill: h-6, 12/24 type, icon-aware padding. No gray ring. */
const TYPE_CHIP_SHELL =
  "inline-flex h-6 max-w-full shrink-0 items-center justify-center gap-1 rounded-full whitespace-nowrap py-0.5 pl-1.5 pr-2.5 text-[12px]/[24px] font-medium tabular-nums";

/**
 * Ops-scan Type chrome — Production pill shell + original type wash.
 */
export function SignalTypeChip({ type, count, className }: SignalTypeChipProps) {
  const Icon =
    type === "lead"
      ? LeadIcon
      : type === "retention"
        ? RetentionIcon
        : UpsellIcon;

  return (
    <span className={cn(TYPE_CHIP_SHELL, TYPE_CLASS[type], className)}>
      <Icon className="relative -ml-0.5 size-3.5 shrink-0" />
      <span className="relative whitespace-nowrap">{signalTypeLabel(type)}</span>
      {count != null ? (
        <span className="relative tabular">{count}</span>
      ) : null}
    </span>
  );
}
