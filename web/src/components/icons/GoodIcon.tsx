import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string; color?: string };

/** Check-in-circle from `public/icons/good.svg`. */
export function GoodIcon({ className = "size-4 shrink-0", color }: IconProps) {
  return (
    <GeistMaskIcon src="/icons/good.svg" className={className} color={color} />
  );
}
