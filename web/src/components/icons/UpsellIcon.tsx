import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Trend-up glyph from `public/icons/upsell.svg`. */
export function UpsellIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/upsell.svg" className={className} />;
}
