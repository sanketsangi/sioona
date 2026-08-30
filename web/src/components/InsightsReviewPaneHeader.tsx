import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared header chrome for Insights review panes (Suggested Next Action,
 * Feedback, Ground Truth). Conversation uses its own sticky customer header.
 */
export function InsightsReviewPaneHeader({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-sio-border-base px-3 py-2.5 sm:px-4",
        className,
      )}
    >
      <h3
        id={id}
        className="min-w-0 flex-1 truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
      >
        {title}
      </h3>
      {children ? (
        <div className="flex shrink-0 items-center">{children}</div>
      ) : null}
    </div>
  );
}
