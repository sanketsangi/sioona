import type { ReactNode } from "react";
import {
  EvalCard,
  evalCardHeaderClassName,
  evalCardPadClassName,
  evalMetricCellClassName,
} from "@/components/EvalCard";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { Separator } from "@/components/ui/separator";
import type { BackendSignalScore } from "@/lib/backend-client";
import { normalizeSignalScoreCounts, type PilotGoNoGo } from "@/lib/eval";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import { PILOT_MIN_REVIEWS } from "@/lib/pilot-cadence";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

const KNOWN_TYPES = new Set<string>(["lead", "retention", "upsell"]);

function typeLabel(signalType: string): string {
  if (KNOWN_TYPES.has(signalType)) {
    return signalTypeLabel(signalType as SignalType);
  }
  return signalType.replaceAll("_", " ");
}

function typeScorePercent(row: {
  reviewed_count: number;
  correct_count: number;
  incorrect_count: number;
  partially_correct_count: number;
  signal_score: number | null;
}): string {
  return formatPercent(normalizeSignalScoreCounts(row).reviewPrecision);
}

export function goNoGoLabel(value: PilotGoNoGo): string {
  switch (value) {
    case "go":
      return "Go";
    case "hold":
      return "Hold";
    case "insufficient_data":
      return "Insufficient Data";
  }
}

export function goNoGoClass(value: PilotGoNoGo): string {
  switch (value) {
    case "go":
      return "text-sio-status-success-fg";
    case "hold":
      return "text-sio-status-warning-fg";
    case "insufficient_data":
      return "text-sio-fg-subtle";
  }
}

/**
 * Neon-backed Signal Score panel. When score is null, shows offline/empty —
 * never presents JSON review precision as Signal Score.
 *
 * `compact` = dense Eval Metrics Card: header leads with Go / Hold /
 * Insufficient Data, then week counts (n / ≥5 · Correct · Incorrect ·
 * Partial) and Overall last. Cadence, type chips, and all-time stay in the
 * foot. Full layout keeps the two-column metric panel. Insights omits this strip.
 *
 * Primary `score` is the review-window keep-set score (go/no-go). Optional
 * `allTimeScore` is a quiet secondary (Eval only).
 */
export function SignalScoreSummary({
  score,
  compact = false,
  allTimeScore = null,
  windowLabel = "This window",
  windowInvalid = false,
  windowControl = null,
  goNoGo,
  cadence = null,
}: {
  score: BackendSignalScore | null;
  compact?: boolean;
  allTimeScore?: BackendSignalScore | null;
  /** Review-window chrome label (Last 7 days / From …). */
  windowLabel?: string;
  windowInvalid?: boolean;
  windowControl?: ReactNode;
  /** Week-window verdict — omit when backend is offline (never labeled Go). */
  goNoGo?: PilotGoNoGo;
  cadence?: ReactNode;
}) {
  const online = score !== null;
  const normalized = online ? normalizeSignalScoreCounts(score) : null;
  const emptyWindow = online && (normalized?.reviewedCount ?? 0) === 0;
  const primary =
    !online || emptyWindow || normalized?.reviewPrecision == null
      ? "—"
      : formatPercent(normalized.reviewPrecision);
  const byType = online ? score.by_signal_type : [];
  const sourceLine = online ? `${windowLabel} · Neon` : "Backend offline";
  const nLabel = `n / ≥${PILOT_MIN_REVIEWS}`;
  const allTimeNormalized =
    allTimeScore != null ? normalizeSignalScoreCounts(allTimeScore) : null;

  const allTimeLine =
    allTimeNormalized != null ? (
      <p
        className={cn(
          "tabular text-label-12 text-sio-fg-muted",
          compact && "ml-auto shrink-0",
        )}
      >
        All-time pack{" "}
        <span className="font-mono text-sio-fg-subtle">
          {formatPercent(allTimeNormalized.reviewPrecision)}
        </span>
        <span aria-hidden> · </span>
        Reviewed {allTimeNormalized.reviewedCount}
      </p>
    ) : null;

  if (compact) {
    const weekCounts: CompactKpi[] = online
      ? [
          {
            label: nLabel,
            value: `${normalized?.reviewedCount ?? score.reviewed_count} / ${PILOT_MIN_REVIEWS}`,
          },
          { label: "Correct", value: score.correct_count },
          { label: "Incorrect", value: score.incorrect_count, muted: true },
          { label: "Partial", value: score.partially_correct_count, muted: true },
        ]
      : [
          { label: nLabel, value: "—" },
          { label: "Correct", value: "—" },
          { label: "Incorrect", value: "—", muted: true },
          { label: "Partial", value: "—", muted: true },
        ];
    const kpis: CompactKpi[] = [
      ...weekCounts,
      { label: "Overall", value: online ? primary : "—", mono: true },
    ];

    const showFoot =
      !online ||
      emptyWindow ||
      byType.length > 0 ||
      allTimeScore != null ||
      cadence != null;

    return (
      <EvalCard
        className="w-full shrink-0"
        aria-label="Signal Score"
        aria-live="polite"
      >
        <div className={evalCardHeaderClassName}>
          <div className="min-w-0">
            <p className="eyebrow">Signal Score</p>
            {goNoGo ? (
              <p
                className={`text-heading-16 font-medium text-pretty ${goNoGoClass(goNoGo)}`}
              >
                {goNoGoLabel(goNoGo)}
              </p>
            ) : null}
            <p className="text-label-12 text-sio-fg-muted">{sourceLine}</p>
          </div>
          {windowControl || windowInvalid ? (
            <div className="min-w-0 max-w-full">
              {windowControl}
              {windowInvalid ? (
                <p
                  className="mt-1.5 text-label-12 text-sio-fg-subtle"
                  role="alert"
                >
                  Invalid from date — using last 7 days. Enter a calendar date
                  and Apply Window.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <dl className="grid min-w-0 w-full grid-cols-5 divide-x divide-sio-border-base overflow-hidden">
          {kpis.map((kpi) => (
            <CompactStat key={kpi.label} {...kpi} />
          ))}
        </dl>

        {showFoot ? (
          <>
            <Separator className="bg-sio-border-base" />
            <div
              className={cn(
                "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 py-2.5 sm:py-3",
                evalCardPadClassName,
              )}
            >
              {!online ? (
                <p className="w-full text-label-12 text-sio-fg-muted">
                  Backend offline — score unavailable
                </p>
              ) : null}
              {emptyWindow ? (
                <p className="w-full text-label-12 text-sio-fg-muted">
                  No reviews in this window. Mark signals in Shadow Mode to
                  build the week score.
                </p>
              ) : null}
              {cadence ? (
                <div className="w-full min-w-0 text-pretty text-label-13 text-sio-fg-subtle">
                  {cadence}
                </div>
              ) : null}
              {online && byType.length > 0 ? (
                <ul className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-6 gap-y-2 p-0">
                  {byType.map((row) => (
                    <li
                      key={row.signal_type}
                      className="flex min-w-0 items-center gap-2"
                    >
                      {KNOWN_TYPES.has(row.signal_type) ? (
                        <SignalTypeChip type={row.signal_type as SignalType} />
                      ) : (
                        <span className="text-label-12 font-medium text-sio-fg-base">
                          {typeLabel(row.signal_type)}
                        </span>
                      )}
                      <span className="font-mono tabular text-label-12 text-sio-fg-subtle">
                        {typeScorePercent(row)}
                        <span className="ml-1.5 text-sio-fg-muted">
                          ({row.correct_count}/{row.reviewed_count})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {allTimeLine}
            </div>
          </>
        ) : null}
      </EvalCard>
    );
  }

  return (
    <EvalCard
      className="shrink-0"
      aria-label="Signal Score"
      aria-live="polite"
    >
      <div className={evalCardHeaderClassName}>
        <p className="eyebrow">Signal Score</p>
        <p className="text-label-12 text-sio-fg-muted">{sourceLine}</p>
      </div>
      {windowControl || windowInvalid ? (
        <div className="border-b border-sio-border-base px-3 py-2.5 sm:px-4">
          {windowControl}
          {windowInvalid ? (
            <p className="mt-1.5 text-label-12 text-sio-fg-subtle" role="alert">
              Invalid from date — using last 7 days. Enter a calendar date and
              Apply Window.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:divide-x sm:divide-sio-border-base">
        <div className="metric-cell">
          <div className="metric-label">Overall</div>
          <div className="font-mono tabular mt-0.5 text-heading-16 text-sio-fg-base">
            {primary}
          </div>
          {online ? (
            <>
              <p className="tabular mt-1.5 text-copy-14 text-sio-fg-base">
                Reviewed{" "}
                <span className="font-medium">
                  {normalized?.reviewedCount ?? score.reviewed_count}
                </span>
                <span className="text-sio-fg-subtle"> · </span>
                Correct{" "}
                <span className="font-medium">{score.correct_count}</span>
              </p>
              <p className="mt-0.5 tabular text-label-12 text-sio-fg-muted">
                Incorrect {score.incorrect_count}
                <span aria-hidden> · </span>
                Partially correct {score.partially_correct_count}
              </p>
              {allTimeLine}
            </>
          ) : (
            <p className="mt-1.5 text-label-12 text-sio-fg-muted">
              Backend offline — score unavailable
            </p>
          )}
        </div>

        <div className="min-w-0 px-4 py-3">
          <div className="metric-label">By Signal Type</div>
          {!online ? (
            <p className="mt-2 text-copy-14 text-sio-fg-muted">
              Start the FastAPI backend to load Signal Score from Neon.
            </p>
          ) : emptyWindow ? (
            <p className="mt-2 text-copy-14 text-sio-fg-muted">
              No reviews in this window. Mark signals in Shadow Mode to build
              the week score.
            </p>
          ) : byType.length === 0 ? (
            <p className="mt-2 text-copy-14 text-sio-fg-muted">
              No reviews yet. Mark signals in Shadow Mode to build the score.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {byType.map((row) => (
                <li
                  key={row.signal_type}
                  className="flex min-w-0 items-center justify-between gap-3 text-copy-14"
                >
                  {KNOWN_TYPES.has(row.signal_type) ? (
                    <SignalTypeChip type={row.signal_type as SignalType} />
                  ) : (
                    <span className="min-w-0 truncate text-sio-fg-base">
                      {typeLabel(row.signal_type)}
                    </span>
                  )}
                  <span className="shrink-0 font-mono tabular text-sio-fg-subtle">
                    <span className="font-medium text-sio-fg-base">
                      {typeScorePercent(row)}
                    </span>
                    <span className="ml-2 text-label-12">
                      {row.correct_count}/{row.reviewed_count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </EvalCard>
  );
}

type CompactKpi = {
  label: string;
  value: string | number;
  muted?: boolean;
  mono?: boolean;
};

function CompactStat({
  label,
  value,
  muted = false,
  mono = false,
}: CompactKpi) {
  return (
    <div className={evalMetricCellClassName}>
      <dt className="metric-label break-words">{label}</dt>
      <dd
        className={`tabular mt-0.5 text-heading-16 ${mono ? "font-mono" : ""} ${muted ? "text-sio-fg-subtle" : "text-sio-fg-base"}`}
      >
        {value}
      </dd>
    </div>
  );
}
