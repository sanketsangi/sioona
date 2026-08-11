import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Circle + X from `public/icons/cross-circle.svg`. */
export function CrossCircleIcon({
  className = "size-4 shrink-0",
}: IconProps) {
  return (
    <GeistMaskIcon src="/icons/cross-circle.svg" className={className} />
  );
}
