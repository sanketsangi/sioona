import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = {
  className?: string;
  /** Green (good / up) or red (poor / down). Omits → currentColor. */
  tone?: "success" | "danger";
};

const TONE_COLOR = {
  success: "var(--sio-status-success-fg)",
  danger: "var(--sio-status-danger-fg)",
} as const;

/**
 * Solid filled circle-arrow from `public/icons/circle-arrow.svg`
 * (default points down). Rotate 180° for up.
 */
export function CircleArrowIcon({
  className = "size-4 shrink-0",
  tone,
}: IconProps) {
  return (
    <GeistMaskIcon
      src="/icons/circle-arrow.svg"
      className={className}
      color={tone ? TONE_COLOR[tone] : undefined}
    />
  );
}
