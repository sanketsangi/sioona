import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { signalChipClass } from "@/components/SignalScoreChip";
import { signalTypeLabel } from "@/lib/format";
import type { SignalType } from "@/lib/types";

type SignalTypeChipProps = {
  type: SignalType;
  className?: string;
};

/**
 * Ops-scan Type chrome (hairline pill + muted glyph).
 * Colored `SignalBadge` stays for taxonomy tables / legacy colored marks only.
 */
export function SignalTypeChip({ type, className }: SignalTypeChipProps) {
  const Icon =
    type === "lead"
      ? LeadIcon
      : type === "retention"
        ? RetentionIcon
        : UpsellIcon;

  return (
    <span className={className ? `${signalChipClass} ${className}` : signalChipClass}>
      <Icon className="size-3.5 shrink-0 text-sio-fg-muted" />
      <span className="whitespace-nowrap">{signalTypeLabel(type)}</span>
    </span>
  );
}
