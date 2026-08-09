import type { ReactNode } from "react";
import Link from "next/link";
import {
  computePilotCadenceSteps,
  nextPilotCadenceStep,
  PILOT_MIN_REVIEWS,
  type PilotCadenceSurface,
} from "@/lib/pilot-cadence";
import { viewHref } from "@/lib/views";

/**
 * Lightweight 7-day Shadow Mode checklist — one strip, not a card dashboard.
 * Extends the Day-1 path into week-1 rhythm (export → review → score → Eval).
 */
export function Week1PilotStrip({
  reviewedCount = 0,
  hasDay1 = false,
  hasMidWeekUpload = false,
  hasBaseline = false,
  surface = "insights",
}: {
  reviewedCount?: number;
  hasDay1?: boolean;
  hasMidWeekUpload?: boolean;
  hasBaseline?: boolean;
  surface?: PilotCadenceSurface;
}) {
  const steps = computePilotCadenceSteps({
    hasDay1,
    hasMidWeekUpload,
    reviewedCount,
    hasBaseline,
  });
  const next = nextPilotCadenceStep(steps);

  return (
    <section
      className="metric-strip shrink-0"
      aria-label="7-day Shadow Mode pilot checklist"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ds-gray-400 px-4 py-2.5">
        <p className="eyebrow">7-Day Pilot</p>
        <p className="text-label-12 text-ds-gray-900">
          Week-1 Shadow Mode cadence
        </p>
      </div>
      <div className="px-4 py-3">
        <ol className="flex flex-wrap gap-x-4 gap-y-2 text-label-13 text-ds-gray-900">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className="inline-flex min-w-0 items-baseline gap-1.5"
            >
              <span
                className={`tabular font-medium ${
                  step.done ? "text-ds-green-900" : "text-ds-gray-1000"
                }`}
                aria-hidden
              >
                {i + 1}.
              </span>
              <span
                className={
                  step.done ? "text-ds-green-900" : "text-ds-gray-1000"
                }
              >
                {step.done ? `${step.label} (done)` : step.label}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-copy-14 text-ds-gray-900">
          {helperCopy(surface, next?.id ?? null, reviewedCount)}
        </p>
      </div>
    </section>
  );
}

/** @deprecated Use Week1PilotStrip — kept as alias for Day-1 call sites. */
export const Day1PilotStrip = Week1PilotStrip;

function helperCopy(
  surface: PilotCadenceSurface,
  nextId: string | null,
  reviewedCount: number
): ReactNode {
  if (nextId === null) {
    return (
      <>
        Week-1 checklist complete — share go/no-go from{" "}
        <Link href={viewHref("eval")} className="link-accent">
          Eval
        </Link>
        . Suggested actions stay display-only.
      </>
    );
  }

  if (nextId === "day1") {
    if (surface === "upload") {
      return (
        <>
          Start Day 1 here, then open{" "}
          <Link href={viewHref("insights")} className="link-accent">
            Insights
          </Link>{" "}
          for Neon pending review.
        </>
      );
    }
    return (
      <>
        Start with{" "}
        <Link href={viewHref("upload")} className="link-accent">
          Upload
        </Link>{" "}
        or Partner Demo, then review Neon pending on Insights.
      </>
    );
  }

  if (nextId === "midweek") {
    return (
      <>
        Mid-week: bring a fresh weekly export on{" "}
        <Link href={viewHref("upload")} className="link-accent">
          Upload
        </Link>
        , then return to{" "}
        <Link href={viewHref("insights")} className="link-accent">
          Insights
        </Link>{" "}
        for Neon pending.
      </>
    );
  }

  if (nextId === "reviews") {
    const remaining = Math.max(0, PILOT_MIN_REVIEWS - reviewedCount);
    if (surface === "insights") {
      return (
        <>
          Review Neon pending below — {remaining} more SignalScore review
          {remaining === 1 ? "" : "s"} before Eval baseline and go/no-go.
        </>
      );
    }
    return (
      <>
        Mark ≥{PILOT_MIN_REVIEWS} SignalScore reviews on{" "}
        <Link href={viewHref("insights")} className="link-accent">
          Insights
        </Link>
        , then set baseline on{" "}
        <Link href={viewHref("eval")} className="link-accent">
          Eval
        </Link>
        .
      </>
    );
  }

  if (nextId === "baseline") {
    return (
      <>
        Set the partner baseline on{" "}
        <Link href={viewHref("eval")} className="link-accent">
          Eval
        </Link>
        , then share go/no-go. No autonomous actions.
      </>
    );
  }

  // gonogo
  return (
    <>
      Open{" "}
      <Link href={viewHref("eval")} className="link-accent">
        Eval
      </Link>{" "}
      for precision, lift, and go/no-go — then share the call with the partner.
    </>
  );
}
