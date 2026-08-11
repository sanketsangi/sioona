import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string; color?: string };

/** Octagon alert from `public/icons/stop.svg`. */
export function StopIcon({ className = "size-4 shrink-0", color }: IconProps) {
  return (
    <GeistMaskIcon src="/icons/stop.svg" className={className} color={color} />
  );
}
