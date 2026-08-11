import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `eye` (Figma 1:1114) — Action Mode. */
export function EyeIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/eye.svg" className={className} />;
}
