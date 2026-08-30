import type { ComponentProps } from "react";
import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = Omit<ComponentProps<typeof GeistMaskIcon>, "src">;

/** Check-in-circle from `public/icons/good.svg`. */
export function GoodIcon({ className, color, ...props }: IconProps) {
  return (
    <GeistMaskIcon
      src="/icons/good.svg"
      className={className}
      color={color}
      {...props}
    />
  );
}
