import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-sio-border-subtle bg-sio-bg-base px-3 py-2.5 text-base text-sio-fg-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-sio-fg-base placeholder:text-sio-fg-muted focus-visible:border-sio-border-strong focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-sio-bg-disabled disabled:text-sio-fg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--destructive)_20%,transparent)] md:h-9 md:min-h-9 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
