import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Slashed circle. 17×17 viewBox scaled into the 16px slot so the slash is not clipped. */
export function CircleSlashIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/circle-slash.svg" className={className} />;
}
