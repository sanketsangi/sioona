import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `play-circle` (Figma 1:1795). */
export function PlayCircleIcon({
  className = "size-4 shrink-0",
}: IconProps) {
  return <GeistMaskIcon src="/icons/play-circle.svg" className={className} />;
}
