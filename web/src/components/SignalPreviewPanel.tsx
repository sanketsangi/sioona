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
 * Renders nothing when no signal is selected (no empty panel chrome).
 */
export function SignalPreviewPanel({ signal }: { signal: Signal | null }) {
  if (!signal) return null;

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

      <p className="mt-3 line-clamp-4 min-w-0 break-words text-pretty text-copy-16 text-sio-fg-base">
        {signal.summary || "No summary available"}
      </p>

      {quote ? (
        <blockquote className="mt-3 min-w-0 break-words border-l-2 border-sio-border-strong pl-3 text-pretty text-copy-14 text-sio-fg-base">
          “{quote}”
        </blockquote>
      ) : (
        <p className="mt-3 text-label-13 text-sio-fg-muted">
          No primary evidence quote
        </p>
      )}

      {signal.suggestedAction ? (
        <p className="mt-3 line-clamp-2 min-w-0 break-words text-label-13 text-sio-fg-muted">
          Next · {signal.suggestedAction}
        </p>
      ) : null}

      <div
        className="mt-auto flex flex-wrap gap-2 border-t border-sio-border-base pt-4"
        role="group"
        aria-label="Preview actions"
      >
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
