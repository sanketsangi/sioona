import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { SignalBadge } from "@/components/SignalBadge";
import { formatScore, primaryQuote, signalTypeLabel } from "@/lib/format";
import { viewHref } from "@/lib/views";
import type { Signal, SignalType } from "@/lib/types";

function isPending(signal: Signal): boolean {
  return signal.status === "new" || !signal.feedback;
}

function reviewLabel(signal: Signal): string {
  if (signal.feedback?.label) {
    return signal.feedback.label.replace("_", " ");
  }
  return signalTypeLabel(signal.type as SignalType);
}

/**
 * Compact right-pane preview for Insights split layout.
 * Full feedback + transcript live on Signal Detail (`?signal=`).
 */
export function SignalPreviewPanel({
  signal,
  clearHref,
}: {
  signal: Signal | null;
  /** Href that drops preview while keeping filters (for missing-id recovery). */
  clearHref?: string | null;
}) {
  if (!signal) {
    return (
      <div
        className="panel scroll-region flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10"
        role="status"
      >
        <p className="text-heading-16 text-sio-fg-base">Select a signal</p>
        <p className="mt-1.5 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
          Choose a row in the queue to preview type, evidence, and score — then
          open full detail to leave feedback.
        </p>
        {clearHref ? (
          <Link href={clearHref} className="btn-secondary mt-4">
            Clear Preview
          </Link>
        ) : null}
      </div>
    );
  }

  const pending = isPending(signal);
  const score = formatScore(signal.score);
  const typeLabel = signalTypeLabel(signal.type);
  const statusText = pending
    ? "Pending"
    : `Reviewed · ${reviewLabel(signal)}`;
  const quote = primaryQuote(signal.evidence);
  const detailHref = viewHref("insights", { signal: signal.id });

  return (
    <div className="panel scroll-region flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SignalBadge type={signal.type} />
        <span className="signal-score" aria-hidden>
          {score}
        </span>
        <span
          className={`signal-status min-w-0 ${
            pending ? "signal-status-pending" : "signal-status-reviewed"
          }`}
        >
          <span className="signal-status-dot" aria-hidden />
          <span className="truncate">{statusText}</span>
        </span>
      </div>

      <p className="mt-3 line-clamp-4 break-words text-pretty text-copy-16 text-sio-fg-base">
        {signal.summary || "No summary available"}
      </p>

      {quote ? (
        <blockquote className="mt-3 break-words border-l-2 border-sio-border-strong pl-3 text-pretty text-copy-14 text-sio-fg-base">
          “{quote}”
        </blockquote>
      ) : (
        <p className="mt-3 text-label-13 text-sio-fg-subtle">
          No primary evidence quote
        </p>
      )}

      {signal.suggestedAction ? (
        <p className="mt-3 line-clamp-2 break-words text-label-13 text-sio-fg-subtle">
          Next · {signal.suggestedAction}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-sio-border-base pt-4">
        <Link href={detailHref} className="btn-primary">
          Open Full Detail
          <ArrowRight className="size-3.5" weight="bold" aria-hidden />
        </Link>
        <Link href={detailHref} className="btn-secondary">
          Add Feedback
        </Link>
      </div>

      <p className="sr-only">
        {typeLabel} signal preview, score {score}, {statusText}.
      </p>
    </div>
  );
}
