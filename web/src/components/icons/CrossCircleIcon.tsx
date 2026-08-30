import type { ComponentProps } from "react";
import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = Omit<ComponentProps<typeof GeistMaskIcon>, "src">;

/** Circle + X from `public/icons/cross-circle.svg`. */
export function CrossCircleIcon({ className, ...props }: IconProps) {
  return (
    <GeistMaskIcon
      src="/icons/cross-circle.svg"
      className={className}
      {...props}
    />
  );
}
