import type { ReactNode } from "react";
import { evalCardHeaderClassName } from "@/components/EvalCard";
import { cn } from "@/lib/utils";

/** Pane titles — heading-14 medium, foreground for contrast. */
export const REVIEW_PANE_TITLE_CLASS =
  "min-w-0 flex-1 truncate text-heading-14 font-medium text-sio-fg-base";

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
        evalCardHeaderClassName,
        className,
      )}
    >
      <h3
        id={id}
        className={`${REVIEW_PANE_TITLE_CLASS}${children ? " basis-full sm:basis-auto" : ""}`}
      >
        {title}
      </h3>
      {children ? (
        <div className="flex shrink-0 items-center">{children}</div>
      ) : null}
    </div>
  );
}
