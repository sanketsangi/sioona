import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { SignalBadge } from "@/components/SignalBadge";
import { formatScore, primaryQuote, signalTypeLabel } from "@/lib/format";
import { viewHref } from "@/lib/views";
import type { Message, Signal, SignalType } from "@/lib/types";

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
 * Chat fills the pane; actions stay pinned at the bottom.
 * Full feedback lives on Signal Detail (`?signal=`).
 * Renders nothing when no signal is selected (no empty panel chrome).
 */
export function SignalPreviewPanel({
  signal,
  messages = [],
  detailExtras,
}: {
  signal: Signal | null;
  /** Conversation transcript for the selected signal. */
  messages?: Message[];
  /** Preserve queue filters / banners on Open Full Detail. */
  detailExtras?: Record<string, string | undefined | null>;
}) {
  if (!signal) return null;

  const pending = isPending(signal);
  const score = formatScore(signal.score);
  const typeLabel = signalTypeLabel(signal.type);
  const statusText = pending
    ? "Pending"
    : `Reviewed · ${reviewLabel(signal)}`;
  const quote = primaryQuote(signal.evidence);
  const detailHref = viewHref("insights", {
    ...detailExtras,
    signal: signal.id,
  });

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden p-3.5 sm:p-4">
      <div className="flex shrink-0 min-w-0 flex-wrap items-center gap-2">
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

      <p className="mt-2.5 line-clamp-2 shrink-0 min-w-0 break-words text-pretty text-copy-14 font-medium text-sio-fg-base">
        {signal.summary || "No summary available"}
      </p>

      {quote ? (
        <blockquote className="mt-2 shrink-0 min-w-0 break-words border-l-2 border-sio-border-base pl-3 text-pretty text-label-13 text-sio-fg-subtle line-clamp-2">
          “{quote}”
        </blockquote>
      ) : null}

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <h3 className="eyebrow shrink-0">Conversation</h3>
        {messages.length === 0 ? (
          <div className="scroll-region mt-2 flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center">
            <p className="text-copy-14 text-sio-fg-base">No messages stored</p>
            <p className="mt-1 max-w-xs text-pretty text-label-13 text-sio-fg-muted">
              Open full detail after re-upload or re-detect to attach the
              transcript.
            </p>
          </div>
        ) : (
          <ul className="scroll-region mt-2 min-h-0 flex-1 space-y-1.5">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`rounded-sm px-2.5 py-2 text-copy-14 ${
                  message.role === "customer"
                    ? "bg-sio-bg-muted text-sio-fg-base"
                    : "bg-transparent text-sio-fg-subtle ring-1 ring-inset ring-sio-border-base"
                }`}
              >
                <div className="mb-0.5 text-label-12 capitalize text-sio-fg-muted">
                  {message.role}
                </div>
                <p className="break-words text-pretty">{message.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="mt-auto flex shrink-0 flex-wrap gap-2 border-t border-sio-border-base pt-3"
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
