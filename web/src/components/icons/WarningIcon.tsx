import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string; color?: string };

/** Triangle alert from `public/icons/warning.svg`. */
export function WarningIcon({
  className = "size-4 shrink-0",
  color,
}: IconProps) {
  return (
    <GeistMaskIcon
      src="/icons/warning.svg"
      className={className}
      color={color}
    />
  );
}
