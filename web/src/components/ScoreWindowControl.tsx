import Link from "next/link";
import type { SignalScoreWindow } from "@/lib/signal-score-window";
import { cn } from "@/lib/utils";
import { viewHref } from "@/lib/views";

/**
 * Eval review-window chrome. URL is state (`?scoreFrom=`).
 * Submits via GET so the date field stays hydration-safe.
 */
export function ScoreWindowControl({
  window,
  panel,
  className,
}: {
  window: SignalScoreWindow;
  panel?: string | null;
  className?: string;
}) {
  const thisWeekHref = viewHref("eval", {
    panel: panel && panel !== "metrics" ? panel : null,
    scoreFrom: null,
  });
  const thisWeek = window.status === "default";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 sm:justify-end",
        className,
      )}
    >
      <Link
        href={thisWeekHref}
        scroll={false}
        aria-current={thisWeek ? "page" : undefined}
        className={thisWeek ? "btn-secondary" : "btn-tertiary"}
      >
        This Week
      </Link>
      <form
        method="get"
        action="/"
        aria-label="Review window"
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        <input type="hidden" name="view" value="eval" />
        {panel && panel !== "metrics" ? (
          <input type="hidden" name="panel" value={panel} />
        ) : null}
        <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <span className="shrink-0 text-label-12 text-sio-fg-muted">From</span>
          <input
            type="date"
            name="scoreFrom"
            defaultValue={window.dateInput}
            required
            autoComplete="off"
            className="input-field w-full min-w-0 max-w-[11rem] px-2.5"
          />
        </label>
        <button type="submit" className="btn-secondary shrink-0">
          Apply Window
        </button>
      </form>
    </div>
  );
}
