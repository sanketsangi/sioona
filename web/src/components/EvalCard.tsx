import type { ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared Eval / Insights metric Card chrome — same radius, hairline, and
 * no elevation as the Insights queue Card. Use for Signal Score, Labeled
 * Eval, Pilot, Adapt, Labeled tables, and Export eval wells.
 */
export const evalCardClassName =
  "gap-0 overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base py-0 shadow-none ring-0 outline-none [--tw-ring-color:transparent]";

/** Header row — matches `InsightsReviewPaneHeader` gutters. */
export const evalCardHeaderClassName =
  "flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-sio-border-base px-3 py-2.5 sm:px-4";

/** Body / footer pad — same horizontal gutter as the header. */
export const evalCardPadClassName = "px-3 sm:px-4";

/** KPI cell — left edge lines up with header copy. */
export const evalMetricCellClassName = "min-w-0 px-3 py-2.5 sm:px-4";

export function EvalCard({
  className,
  ...props
}: ComponentProps<typeof Card>) {
  return (
    <Card
      size="sm"
      className={cn(evalCardClassName, className)}
      {...props}
    />
  );
}
