import type { ReactNode } from "react";
import { ChatBubbleIcon } from "@/components/icons/ChatBubbleIcon";
import { CircleArrowIcon } from "@/components/icons/CircleArrowIcon";
import { ClockIcon } from "@/components/icons/ClockIcon";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { Card, CardContent } from "@/components/ui/card";
import { StatusDot, type StatusDotState } from "@/components/ui/StatusDot";
import { signalStatusDot } from "@/lib/format";
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
  className?: string;
};

function conversationsWithSignals(signals: Signal[]): number {
  const ids = new Set<string>();
  for (const signal of signals) {
    if (signal.conversationId) ids.add(signal.conversationId);
  }
  return ids.size;
}

/** ≥50% threshold for green ↑ / red ↓. */
const GOOD_COVERAGE_PCT = 50;

/**
 * Share row for Conversations: +% with CircleArrowIcon.
 */
function FoundVsTotal({ found, total }: { found: number; total: number }) {
  const pct = total <= 0 ? 0 : Math.round((found / total) * 100);
  const good = pct >= GOOD_COVERAGE_PCT;
  const tone = good
    ? "text-sio-status-success-fg"
    : "text-sio-status-danger-fg";

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 tabular text-label-12 font-medium",
        tone,
      )}
    >
      <CircleArrowIcon
        className={cn("size-3.5 shrink-0", good && "rotate-180")}
        tone={good ? "success" : "danger"}
      />
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
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
    <ul className="m-0 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 p-0 list-none">
      {REVIEW_STATUS_ORDER.map((label) => (
        <li
          key={label}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-label-12"
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
    <div className="flex min-w-0 flex-col gap-3 px-4 py-4">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-sio-bg-muted text-sio-fg-subtle"
          aria-hidden
        >
          {icon}
        </span>
        <h3 className="truncate text-label-13 font-semibold text-sio-fg-base">
          {title}
        </h3>
      </div>
      <p className="tabular text-heading-20 text-sio-fg-base">{value}</p>
      {compare ? <div className="mt-auto min-w-0 pt-1">{compare}</div> : null}
    </div>
  );
}

/**
 * Keep-set snapshot under the Insights queue heading — coverage, signals,
 * and pending needs-review depth (not Eval SignalScore / go-no-go).
 */
export function InsightsQueueMetrics({
  conversationCount,
  signals,
  pendingSignals,
  className,
}: InsightsQueueMetricsProps) {
  const signalCount = signals.length;
  const foundConversations = conversationsWithSignals(signals);
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
      <Card
        size="sm"
        className="gap-0 py-0"
      >
        <CardContent className="grid grid-cols-1 divide-y divide-sio-border-base p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
          <MetricCell
            title="Conversations"
            value={String(conversationCount)}
            icon={<ChatBubbleIcon className="size-3.5" />}
            compare={
              <FoundVsTotal
                found={foundConversations}
                total={conversationCount}
              />
            }
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
      </Card>
    </section>
  );
}
