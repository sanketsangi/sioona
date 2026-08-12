"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { SignalQueueRow } from "@/components/SignalQueueRow";
import { queueSignalSummary } from "@/lib/format";
import type { Signal } from "@/lib/types";

type SignalReviewPanelProps = {
  signal: Signal;
  customerName: string;
};

/**
 * Insights review chrome — queue row + heading only.
 * Review cards are composed by SignalQueue.
 */
export function SignalReviewPanel({
  signal,
  customerName,
}: SignalReviewPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const who = customerName.trim() || "Customer";
  const pageLabel =
    who !== "Customer"
      ? who
      : queueSignalSummary(signal.summary || "", who).trim() ||
        signal.summary?.trim() ||
        "Signal";
  const headingId = `signal-review-heading-${signal.id}`;
  const bodyId = `signal-review-body-${signal.id}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [signal.id]);

  return (
    <div className="shrink-0">
      <div className="border-b border-sio-border-base bg-sio-bg-base">
        <SignalQueueRow
          signal={signal}
          customerName={who}
          expandText
          action={
            <button
              type="button"
              className="btn-secondary min-h-11 w-full shrink-0 !rounded-full touch-manipulation sm:min-h-0 sm:h-8 sm:w-auto sm:px-3"
              onClick={() => {
                const el = document.getElementById(bodyId);
                if (!el) return;
                const reduced =
                  typeof window !== "undefined" &&
                  window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches;
                el.scrollIntoView({
                  block: "start",
                  behavior: reduced ? "auto" : "smooth",
                });
                headingRef.current?.focus({ preventScroll: true });
              }}
            >
              Review
            </button>
          }
        />
      </div>

      <h2
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="sr-only scroll-mt-4 outline-none"
      >
        Review {pageLabel}
      </h2>
    </div>
  );
}

/** Empty / missing preview recovery inside the queue list shell. */
export function SignalReviewMissing({
  queueHref,
  previewId,
}: {
  queueHref: string;
  previewId: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [previewId]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-heading-16 text-sio-fg-base outline-none"
      >
        Signal Not Found
      </h2>
      <p className="mt-1.5 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
        This preview is missing from the needs-review queue. Return to the list
        or try another filter.
      </p>
      <Link href={queueHref} scroll={false} className="btn-secondary mt-4">
        Back to Queue
      </Link>
    </div>
  );
}
