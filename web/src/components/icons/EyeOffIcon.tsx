import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `eye-off` (Figma 1:1118) — Shadow Mode. */
export function EyeOffIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/eye-off.svg" className={className} />;
}
