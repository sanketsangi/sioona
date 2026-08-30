import type { ComponentProps } from "react";
import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = Omit<ComponentProps<typeof GeistMaskIcon>, "src">;

/** Triangle alert from `public/icons/warning.svg`. */
export function WarningIcon({ className, color, ...props }: IconProps) {
  return (
    <GeistMaskIcon
      src="/icons/warning.svg"
      className={className}
      color={color}
      {...props}
    />
  );
}
