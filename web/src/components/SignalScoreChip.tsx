import { GoodIcon } from "@/components/icons/GoodIcon";
import { StopIcon } from "@/components/icons/StopIcon";
import { WarningIcon } from "@/components/icons/WarningIcon";
import {
  formatScore,
  scoreIconColor,
  scoreIconKind,
} from "@/lib/format";

/** Quiet Type/Score pill: rounded-full, base fill, hairline only (no elevation). */
export const signalChipClass =
  "inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-sio-bg-base px-2 text-label-12 font-medium leading-5 text-sio-fg-base shadow-[0_0_0_1px_rgba(0,0,0,0.08)]";

type SignalScoreChipProps = {
  score: number;
  className?: string;
};

/**
 * Detection score chrome for Insights — band icon + tabular digits.
 * Bands/hex via `scoreIconKind` / `scoreIconColor` in `format.ts` only.
 */
export function SignalScoreChip({ score, className }: SignalScoreChipProps) {
  const kind = scoreIconKind(score);
  const Icon =
    kind === "good" ? GoodIcon : kind === "warning" ? WarningIcon : StopIcon;

  return (
    <span className={className ? `${signalChipClass} ${className}` : signalChipClass}>
      <Icon
        className="size-3.5 shrink-0"
        color={scoreIconColor(score)}
      />
      <span className="tabular truncate">{formatScore(score)}</span>
    </span>
  );
}
