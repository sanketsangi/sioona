import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `lifebuoy` (Figma 1:1323) — Help. */
export function LifebuoyIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/lifebuoy.svg" className={className} />;
}
