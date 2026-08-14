import Link from "next/link";
import type { SignalScoreWindow } from "@/lib/signal-score-window";
import { viewHref } from "@/lib/views";

/**
 * Eval review-window chrome. URL is state (`?scoreFrom=`).
 * Submits via GET so the date field stays hydration-safe.
 */
export function ScoreWindowControl({
  window,
  panel,
}: {
  window: SignalScoreWindow;
  panel?: string | null;
}) {
  const thisWeekHref = viewHref("eval", {
    panel: panel && panel !== "metrics" ? panel : null,
    scoreFrom: null,
  });
  const thisWeek = window.status === "default";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <Link
        href={thisWeekHref}
        scroll={false}
        aria-current={thisWeek ? "page" : undefined}
        className={`nav-link ${thisWeek ? "nav-link-active" : ""}`}
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
        <label className="flex min-w-0 items-center gap-1.5">
          <span className="text-label-12 text-sio-fg-muted">From</span>
          <input
            type="date"
            name="scoreFrom"
            defaultValue={window.dateInput}
            required
            autoComplete="off"
            className="input-field h-11 min-h-11 w-[10.5rem] px-2 py-0 md:h-8 md:min-h-0"
          />
        </label>
        <button type="submit" className="btn-secondary">
          Apply Window
        </button>
      </form>
    </div>
  );
}
