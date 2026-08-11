import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `refresh-clockwise` (Figma 1:1831). */
export function RefreshClockwiseIcon({
  className = "size-4 shrink-0",
}: IconProps) {
  return (
    <GeistMaskIcon src="/icons/refresh-clockwise.svg" className={className} />
  );
}
