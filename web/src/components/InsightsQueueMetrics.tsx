import type { ReactNode } from "react";
import Link from "next/link";
import { ChatBubbleIcon } from "@/components/icons/ChatBubbleIcon";
import { ClockIcon } from "@/components/icons/ClockIcon";
import { LayersIcon } from "@/components/icons/LayersIcon";
import {
  EvalCard,
  evalCardPadClassName,
  evalMetricCellClassName,
} from "@/components/EvalCard";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { CardContent } from "@/components/ui/card";
import { StatusDot, type StatusDotState } from "@/components/ui/StatusDot";
import { SCORE_WAITING_LINE, SCORE_WAITING_RETRY } from "@/lib/backend-wake";
import { signalStatusDot } from "@/lib/format";
import { PILOT_MIN_REVIEWS } from "@/lib/pilot-cadence";
import type { Signal, SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIGNAL_TYPES: SignalType[] = ["lead", "retention", "upsell"];

/** Queue Status column outcomes — same chrome as `SignalStatus`. */
const REVIEW_STATUS_ORDER = [
  "Pending",
  "Correct",
  "Incorrect",
  "Partially Correct",
  "Acted",
] as const;

type ReviewStatusLabel = (typeof REVIEW_STATUS_ORDER)[number];

const REVIEW_STATUS_STATE: Record<ReviewStatusLabel, StatusDotState> = {
  Pending: "QUEUED",
  Correct: "READY",
  Incorrect: "ERROR",
  "Partially Correct": "BUILDING",
  Acted: "CANCELED",
};

type InsightsQueueMetricsProps = {
  conversationCount: number;
  signals: Signal[];
  /** Neon needs-review join (or feedback-less fallback). */
  pendingSignals: Signal[];
  /**
   * Windowed keep-set reviewed_count from Neon. `0` is an empty window.
   * `null` / omit = backend offline — do not invent a count.
   */
  reviewedCount?: number | null;
  /**
   * Count-SoT correct from the same week score (`normalizeSignalScoreCounts`).
   * Shown only beside a positive reviewed count. Omit when offline or empty.
   */
  correctCount?: number | null;
  /**
   * Score service asleep. Keep the count cells; say the score is waiting.
   * `retryHref` is the one Retry — omit when an empty panel already has it.
   */
  scoreWaiting?: boolean;
  retryHref?: string | null;
  className?: string;
};

function conversationsWithSignals(signals: Signal[]): number {
  const ids = new Set<string>();
  for (const signal of signals) {
    if (signal.conversationId) ids.add(signal.conversationId);
  }
  return ids.size;
}

/** Keep-set counts for all three types — queue SignalTypeChip chrome + count. */
function SignalTypeCounts({ counts }: { counts: Record<SignalType, number> }) {
  return (
    <ul className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 p-0 list-none">
      {SIGNAL_TYPES.map((type) => (
        <li key={type} className="min-w-0">
          <SignalTypeChip type={type} count={counts[type]} />
        </li>
      ))}
    </ul>
  );
}

/** Keep-set counts by review status — queue StatusDot chrome + count. */
function SignalStatusCounts({
  counts,
}: {
  counts: Record<ReviewStatusLabel, number>;
}) {
  return (
    <ul className="m-0 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 p-0 list-none">
      {REVIEW_STATUS_ORDER.map((label) => (
        <li
          key={label}
          className="inline-flex min-w-0 items-center gap-1 text-label-12"
        >
          <StatusDot label state={REVIEW_STATUS_STATE[label]}>
            {label}
          </StatusDot>
          <span className="tabular font-medium text-sio-fg-base">
            {counts[label]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MetricCell({
  title,
  value,
  icon,
  compare,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  compare?: ReactNode;
}) {
  return (
    <div
      className={cn(
        evalMetricCellClassName,
        "flex min-w-0 flex-col gap-2",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-sio-bg-muted text-sio-fg-subtle"
          aria-hidden
        >
          {icon}
        </span>
        <h3 className="truncate text-label-12 font-medium text-sio-fg-subtle">
          {title}
        </h3>
      </div>
      <p className="tabular text-heading-16 text-sio-fg-base">{value}</p>
      {compare ? <div className="min-w-0">{compare}</div> : null}
    </div>
  );
}

/** Week footer: n / ≥5, plus correct/reviewed when that week score has reviews. */
function weekReviewFooter(
  reviewedCount: number,
  correctCount: number | null,
): string {
  if (reviewedCount <= 0) {
    return `Review ${PILOT_MIN_REVIEWS} chats this week`;
  }
  const reviews = `This week ${reviewedCount} of ${PILOT_MIN_REVIEWS} reviews`;
  if (correctCount == null || !Number.isFinite(correctCount) || correctCount < 0) {
    return reviews;
  }
  return `${reviews} · ${correctCount}/${reviewedCount} correct`;
}

/**
 * Keep-set snapshot under the Insights queue heading — coverage, signals,
 * and pending needs-review depth. Quiet n / ≥5 footer is windowed Neon
 * reviewed_count toward ≥80% Go — not the win by itself. A positive week
 * adds the count-SoT correct/reviewed ratio beside that line.
 */
export function InsightsQueueMetrics({
  conversationCount,
  signals,
  pendingSignals,
  reviewedCount = null,
  correctCount = null,
  scoreWaiting = false,
  retryHref = null,
  className,
}: InsightsQueueMetricsProps) {
  const signalCount = signals.length;
  const pendingConversationCount = conversationsWithSignals(pendingSignals);
  const typeCounts: Record<SignalType, number> = {
    lead: 0,
    retention: 0,
    upsell: 0,
  };
  const statusCounts: Record<ReviewStatusLabel, number> = {
    Pending: 0,
    Correct: 0,
    Incorrect: 0,
    "Partially Correct": 0,
    Acted: 0,
  };
  for (const signal of signals) {
    typeCounts[signal.type] += 1;
    const { label } = signalStatusDot(signal);
    if (label in statusCounts) {
      statusCounts[label as ReviewStatusLabel] += 1;
    }
  }

  return (
    <section
      aria-label="Queue metrics"
      className={cn("shrink-0 overflow-x-clip", className)}
    >
      <EvalCard>
        <CardContent className="grid grid-cols-1 divide-y divide-sio-border-base p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
          <MetricCell
            title="Conversations"
            value={String(conversationCount)}
            icon={<ChatBubbleIcon className="size-3.5" />}
          />
          <MetricCell
            title="Signals"
            value={String(signalCount)}
            icon={<LayersIcon className="size-3.5" />}
            compare={<SignalTypeCounts counts={typeCounts} />}
          />
          <MetricCell
            title="Pending"
            value={String(pendingConversationCount)}
            icon={<ClockIcon className="size-3.5" />}
            compare={<SignalStatusCounts counts={statusCounts} />}
          />
        </CardContent>
        {scoreWaiting ? (
          <div
            className={cn(
              evalCardPadClassName,
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-sio-border-base py-2",
            )}
          >
            <p className="text-label-12 text-sio-fg-muted" role="status">
              {SCORE_WAITING_LINE}
            </p>
            {retryHref ? (
              <Link href={retryHref} className="btn-primary">
                {SCORE_WAITING_RETRY}
              </Link>
            ) : null}
          </div>
        ) : reviewedCount != null ? (
          <p
            className={cn(
              evalCardPadClassName,
              "border-t border-sio-border-base py-2 tabular text-label-12 text-sio-fg-muted",
            )}
          >
            {weekReviewFooter(reviewedCount, correctCount)}
          </p>
        ) : null}
      </EvalCard>
    </section>
  );
}
