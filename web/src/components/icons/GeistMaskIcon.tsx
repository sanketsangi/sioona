import type { HTMLAttributes } from "react";
import {
  geistMaskImage,
  type GeistMaskSrc,
} from "@/components/icons/geist-mask-svg";
import { cn } from "@/lib/utils";

type GeistMaskIconProps = HTMLAttributes<HTMLSpanElement> & {
  src: GeistMaskSrc;
  /** Sets `currentColor` for `bg-current` mask paint. */
  color?: string;
};

/** Masked Geist SVG so fill follows `currentColor` (inlined; no /icons HTTP). */
export function GeistMaskIcon({
  src,
  className,
  color,
  ...props
}: GeistMaskIconProps) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 bg-current [mask-image:var(--geist-icon)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:var(--geist-icon)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]",
        className,
      )}
      style={{
        ["--geist-icon" as string]: geistMaskImage(src),
        ...(color ? { color } : {}),
      }}
      aria-hidden
      {...props}
    />
  );
}
