"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** First tooltip waits; later ones in the same provider open sooner. */
export const TOOLTIP_DELAY_MS = 400

/**
 * Quiet Ground Truth hint chrome: panel radius, base fill and border,
 * layered shadow, copy-14. Fade only — no zoom, no inverse bubble.
 */
export const TOOLTIP_CONTENT_CLASS = cn(
  "material-menu z-50 w-fit max-w-[16rem] origin-[var(--radix-tooltip-content-transform-origin)] gap-0 rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-3 text-pretty text-copy-14 text-sio-fg-subtle ring-0 outline-none",
  "shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.04),0_12px_24px_-4px_rgba(0,0,0,0.06)]",
  "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-100",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-100",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-100",
  "data-open:zoom-in-100 data-closed:zoom-out-100",
  "motion-reduce:animate-none motion-reduce:duration-0",
)

function TooltipProvider({
  delayDuration = TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(TOOLTIP_CONTENT_CLASS, className)}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
