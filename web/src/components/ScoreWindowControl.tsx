"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react/ssr";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SignalScoreWindow } from "@/lib/signal-score-window";
import { cn } from "@/lib/utils";
import { viewHref } from "@/lib/views";

const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Fixed locale + UTC so the slice bounds match on the server and the client. */
const REVIEW_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** Format one in-slice `reviewed_at`. Invalid or missing values stay blank. */
export function formatIncludedReviewTime(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return REVIEW_TIME.format(ms);
}

/** Parse `YYYY-MM-DD` as a local calendar day (picker selection). */
function parseDateInput(raw: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return new Date();
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return new Date(y, m - 1, d);
}

/** Format a local calendar day as `YYYY-MM-DD` for `?scoreFrom=`. */
function toScoreFrom(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Eval review-window chrome. URL is state (`?scoreFrom=`).
 * Calendar pick navigates via the router (same query contract as the old GET form).
 */
export function ScoreWindowControl({
  window,
  panel,
  className,
  firstReviewedAt = null,
  lastReviewedAt = null,
}: {
  window: SignalScoreWindow;
  panel?: string | null;
  className?: string;
  /** Earliest review in the current slice. Omit when the window is empty. */
  firstReviewedAt?: string | null;
  /** Latest review in the current slice. Omit when the window is empty. */
  lastReviewedAt?: string | null;
}) {
  const router = useRouter();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const selected = parseDateInput(window.dateInput);

  const panelParam = panel && panel !== "metrics" ? panel : null;
  const thisWeekHref = viewHref("eval", {
    panel: panelParam,
    scoreFrom: null,
  });
  const thisWeek = window.status === "default";
  const firstLabel = formatIncludedReviewTime(firstReviewedAt);
  const lastLabel = formatIncludedReviewTime(lastReviewedAt);
  const reviewSpan =
    firstLabel && lastLabel && firstReviewedAt && lastReviewedAt
      ? { firstLabel, lastLabel, firstReviewedAt, lastReviewedAt }
      : null;

  function applyScoreFrom(date: Date | undefined) {
    if (!date) return;
    setOpen(false);
    router.push(
      viewHref("eval", {
        panel: panelParam,
        scoreFrom: toScoreFrom(date),
      }),
      { scroll: false }
    );
  }

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
      <div
        className="flex min-w-0 flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Review window"
      >
        <span
          className="shrink-0 text-label-12 text-sio-fg-muted"
          id={labelId}
        >
          From
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="btn-secondary min-w-0 max-w-[14rem] justify-start gap-1.5 truncate"
              aria-labelledby={labelId}
              aria-haspopup="dialog"
            >
              <CalendarBlank
                weight="regular"
                className="size-4 shrink-0 text-sio-fg-subtle"
                aria-hidden
              />
              <span className="truncate">{DATE_LABEL.format(selected)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            aria-label="Choose from date"
            className="w-auto border border-sio-border-subtle bg-sio-bg-base p-0 text-sio-fg-base shadow-md motion-reduce:animate-none"
          >
            <Calendar
              mode="single"
              selected={selected}
              onSelect={applyScoreFrom}
              defaultMonth={selected}
              autoFocus
              className="[--cell-size:2rem] bg-sio-bg-base"
            />
          </PopoverContent>
        </Popover>
      </div>
      {reviewSpan ? (
        <p className="basis-full text-label-12 text-sio-fg-muted">
          First review{" "}
          <time
            dateTime={reviewSpan.firstReviewedAt}
            className="tabular text-sio-fg-subtle"
          >
            {reviewSpan.firstLabel}
          </time>
          <span aria-hidden> · </span>
          Last review{" "}
          <time
            dateTime={reviewSpan.lastReviewedAt}
            className="tabular text-sio-fg-subtle"
          >
            {reviewSpan.lastLabel}
          </time>
        </p>
      ) : null}
    </div>
  );
}
