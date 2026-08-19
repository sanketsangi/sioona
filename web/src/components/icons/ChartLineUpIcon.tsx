import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Bar-chart mark from `public/icons/chart-line-up.svg`. */
export function ChartLineUpIcon({ className = "size-4 shrink-0" }: IconProps) {
  return (
    <GeistMaskIcon src="/icons/chart-line-up.svg" className={className} />
  );
}
