import type { ComponentProps } from "react";
import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = Omit<ComponentProps<typeof GeistMaskIcon>, "src">;

/** Outline ring + check from `public/icons/check-circle.svg`. */
export function CheckCircleOutlineIcon({ className, ...props }: IconProps) {
  return (
    <GeistMaskIcon
      src="/icons/check-circle.svg"
      className={className}
      {...props}
    />
  );
}
