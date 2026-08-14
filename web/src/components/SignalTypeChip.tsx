import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { signalChipClass } from "@/components/SignalScoreChip";
import { signalTypeLabel, signalTypeMarkClass } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalTypeChipProps = {
  type: SignalType;
  /** Optional keep-set count shown after the type label. */
  count?: number;
  className?: string;
};

/**
 * Ops-scan Type chrome — hairline pill tinted by signal type
 * (lead=blue, retention=amber, upsell=teal). Label always accompanies color.
 */
export function SignalTypeChip({ type, count, className }: SignalTypeChipProps) {
  const Icon =
    type === "lead"
      ? LeadIcon
      : type === "retention"
        ? RetentionIcon
        : UpsellIcon;

  return (
    <span
      className={cn(
        signalChipClass,
        "leading-none",
        signalTypeMarkClass(type),
        className,
      )}
    >
      <Icon className="block size-3.5 shrink-0" />
      <span className="translate-y-px whitespace-nowrap text-label-12 font-medium leading-none">
        {signalTypeLabel(type)}
      </span>
      {count != null ? (
        <span className="translate-y-px tabular text-label-12 font-medium leading-none">
          {count}
        </span>
      ) : null}
    </span>
  );
}
