import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `bell` (Figma 1:869) — Notifications. */
export function BellIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/bell.svg" className={className} />;
}
