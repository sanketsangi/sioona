import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import {
  formatScore,
  primaryQuote,
  queueSignalSummary,
  signalReviewStatusLabel,
  signalTypeLabel,
} from "@/lib/format";
import { viewHref } from "@/lib/views";
import type { Message, Signal } from "@/lib/types";

/**
 * Compact right-pane preview for Insights split layout.
 * Summary + evidence stay inline; full transcript opens in ConversationDrawer.
 * Full feedback lives on Signal Detail (`?signal=`).
 * Renders nothing when no signal is selected (no empty panel chrome).
 */
export function SignalPreviewPanel({
  signal,
  messages = [],
  customerName = null,
  detailExtras,
}: {
  signal: Signal | null;
  /** Conversation transcript for the selected signal. */
  messages?: Message[];
  /** Display name for the User column / transcript (from store or externalId). */
  customerName?: string | null;
  /** Preserve queue filters / banners on Open Full Detail. */
  detailExtras?: Record<string, string | undefined | null>;
}) {
  if (!signal) return null;

  const score = formatScore(signal.score);
  const typeLabel = signalTypeLabel(signal.type);
  const statusText = signalReviewStatusLabel(signal);
  const quote = primaryQuote(signal.evidence);
  const detailHref = viewHref("insights", {
    ...detailExtras,
    signal: signal.id,
  });
  const who = customerName?.trim() || "Customer";
  const summaryText = queueSignalSummary(signal.summary || "", who);

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden p-3.5 sm:p-4">
      <div className="flex shrink-0 min-w-0 flex-wrap items-center gap-2">
        <SignalTypeChip type={signal.type} />
        <SignalScoreChip score={signal.score} />
        <SignalStatus signal={signal} />
      </div>

      <SignalUser name={who} className="mt-2.5 shrink-0" />

      <p className="mt-1 line-clamp-2 shrink-0 min-w-0 break-words text-pretty text-copy-14 font-medium text-sio-fg-base">
        {summaryText || "No summary available"}
      </p>

      {quote ? (
        <blockquote className="mt-2 shrink-0 min-w-0 break-words border-l-2 border-sio-border-base pl-3 text-pretty text-label-13 text-sio-fg-subtle line-clamp-2">
          “{quote}”
        </blockquote>
      ) : null}

      <div className="mt-3 shrink-0">
        <ConversationDrawer
          messages={messages}
          customerName={who}
          typeLabel={typeLabel}
          summary={signal.summary || ""}
          detailHref={detailHref}
        />
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
        {who}. {typeLabel} signal preview, score {score}, {statusText}.
      </p>
    </div>
  );
}
