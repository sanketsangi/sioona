"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import {
  RetentionEmailDecisionChip,
  type QueueReviewActionLabel,
} from "@/components/RetentionEmailAction";
import type { SupervisedActionDecision } from "@/lib/types";
import {
  QUEUE_REVIEW_ACTION_CLASS,
  SignalQueueCard,
  SignalQueueRow,
} from "@/components/SignalQueueRow";
import { Button } from "@/components/ui/button";
import { Table, TableBody } from "@/components/ui/table";
import { queueSignalSummary } from "@/lib/format";
import type { Signal } from "@/lib/types";

type SignalReviewPanelProps = {
  signal: Signal;
  customerName: string;
  /** Sticky column header row (same chrome as the list DataTable). */
  header: ReactNode;
  /** Review-row label. Correct ¬acted is Acted; the list command is Mark as Acted. */
  actionLabel?: QueueReviewActionLabel;
};

/**
 * Insights review chrome — one table row + heading only.
 * Review cards are composed by SignalQueue.
 */
export function SignalReviewPanel({
  signal,
  customerName,
  header,
  actionLabel = "Review",
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
  const decisionStatus = retentionDecisionFromReviewLabel(actionLabel);

  useEffect(() => {
    headingRef.current?.focus();
  }, [signal.id]);

  return (
    <div className="shrink-0 bg-sio-bg-base">
      <ul className="md:hidden">
        <SignalQueueCard
          signal={signal}
          customerName={who}
          previewHref={`#${bodyId}`}
          previewAriaLabel={`Review ${pageLabel}`}
          action={decisionStatus ? <RetentionEmailDecisionChip status={decisionStatus} /> : null}
        />
      </ul>
      <div className="hide-scrollbar relative hidden overflow-auto md:block">
        <Table className="min-w-[640px]">
          {header}
          <TableBody>
            <SignalQueueRow
              signal={signal}
              customerName={who}
              expandText
              action={
                decisionStatus ? (
                  <RetentionEmailDecisionChip status={decisionStatus} />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={QUEUE_REVIEW_ACTION_CLASS}
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
                    {actionLabel}
                  </Button>
                )
              }
            />
          </TableBody>
        </Table>
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

function retentionDecisionFromReviewLabel(
  label: QueueReviewActionLabel,
): SupervisedActionDecision | null {
  if (label === "Approved") return "approved";
  if (label === "Edited") return "edited";
  if (label === "Dismissed") return "dismissed";
  return null;
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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-12">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-balance text-heading-16 text-sio-fg-base outline-none"
      >
        Signal Not Found
      </h2>
      <p className="mt-2 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
        This preview is missing from the Insights queue. Return to the list
        or try another filter.
      </p>
      <Link href={queueHref} scroll={false} className="btn-secondary mt-4">
        Back to Queue
      </Link>
    </div>
  );
}
