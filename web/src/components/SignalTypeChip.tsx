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

/**
 * Pastel type washes + StatusDot label text (Lead ← Pending, Retention ←
 * Partially Correct, Upsell ← Correct). Badge `signalTypeMarkClass` untouched.
 */
const TYPE_CHIP: Record<SignalType, string> = {
  lead: "bg-sio-signal-lead-bg text-sio-fg-link",
  retention: "bg-sio-signal-retention-bg text-sio-status-warning-fg",
  upsell: "bg-sio-signal-upsell-bg text-sio-status-success-fg",
};

/** Production-badge chrome: inset gray-alpha ring, h-6 / icon-aware padding. */
const TYPE_CHIP_SHELL =
  "inline-flex h-6 max-w-full shrink-0 items-center justify-center gap-1 rounded-full whitespace-nowrap py-0.5 pl-1.5 pr-2.5 text-[12px]/[24px] font-medium tabular-nums ring-1 ring-inset ring-ds-gray-alpha-400";

/**
 * Ops-scan Type chrome — Production pill shell + type wash; icon/label/count inherit.
 */
export function SignalTypeChip({ type, count, className }: SignalTypeChipProps) {
  const Icon =
    type === "lead"
      ? LeadIcon
      : type === "retention"
        ? RetentionIcon
        : UpsellIcon;

  return (
    <span className={cn(TYPE_CHIP_SHELL, TYPE_CHIP[type], className)}>
      <Icon className="size-3.5 shrink-0" />
      <span className="whitespace-nowrap">{signalTypeLabel(type)}</span>
      {count != null ? <span className="tabular">{count}</span> : null}
    </span>
  );
}
