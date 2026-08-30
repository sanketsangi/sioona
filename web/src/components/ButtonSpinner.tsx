import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Spinner for loading buttons — keep the original label beside this. */
export function ButtonSpinner({
  className = "btn-spinner",
  ...props
}: ComponentProps<typeof Spinner>) {
  return (
    <Spinner
      className={cn("size-3.5 shrink-0", className)}
      aria-hidden
      {...props}
    />
  );
}
