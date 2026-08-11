import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Shield glyph from `public/icons/retention.svg`. */
export function RetentionIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/retention.svg" className={className} />;
}
