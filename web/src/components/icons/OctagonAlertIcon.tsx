import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Outline octagon alert. Painted with currentColor via the Geist mask. */
export function OctagonAlertIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/octagon-alert.svg" className={className} />;
}
