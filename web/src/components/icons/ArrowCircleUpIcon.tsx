import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `arrow-circle-up` from `public/icons/arrow-circle-up.svg`. */
export function ArrowCircleUpIcon({
  className = "size-4 shrink-0",
}: IconProps) {
  return (
    <GeistMaskIcon src="/icons/arrow-circle-up.svg" className={className} />
  );
}
