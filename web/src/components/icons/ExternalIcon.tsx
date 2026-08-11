import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `external` (Figma 1:1110). */
export function ExternalIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/external.svg" className={className} />;
}
