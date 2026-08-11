import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `filter` (Figma 1:796). */
export function FilterIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/filter.svg" className={className} />;
}
