import type { ReactNode } from "react";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import type { BackendSignalScore } from "@/lib/backend-client";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

const KNOWN_TYPES = new Set<string>(["lead", "retention", "upsell"]);

function typeLabel(signalType: string): string {
  if (KNOWN_TYPES.has(signalType)) {
    return signalTypeLabel(signalType as SignalType);
  }
  return signalType.replaceAll("_", " ");
}

/**
 * Neon-backed Signal Score panel. When score is null, shows offline/empty —
 * never presents JSON review precision as Signal Score.
 *
 * `compact` = dense Eval Metrics strip: header + window toolbar, five KPI
 * cells in one row (Labeled Eval density), type chips + all-time secondary.
 * Full layout keeps the two-column metric panel.
 * Signal Detail omits this strip (score lives on Insights/Eval).
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
}: {
  score: BackendSignalScore | null;
  compact?: boolean;
  allTimeScore?: BackendSignalScore | null;
  /** Review-window chrome label (Last 7 days / From …). */
  windowLabel?: string;
  windowInvalid?: boolean;
  windowControl?: ReactNode;
}) {
  const online = score !== null;
  const primary = online ? formatPercent(score.signal_score) : "—";
  const byType = online ? score.by_signal_type : [];
  const emptyWindow = online && score.reviewed_count === 0;
  const sourceLine = online ? `${windowLabel} · Neon` : "Backend offline";

  const allTimeLine =
    allTimeScore != null ? (
      <p
        className={cn(
          "tabular text-label-12 text-sio-fg-muted",
          compact && "ml-auto shrink-0",
        )}
      >
        All-time pack{" "}
        <span className="font-mono text-sio-fg-subtle">
          {formatPercent(allTimeScore.signal_score)}
        </span>
        <span aria-hidden> · </span>
        Reviewed {allTimeScore.reviewed_count}
      </p>
    ) : null;

  if (compact) {
    const kpis: CompactKpi[] = online
      ? [
          { label: "Overall", value: primary, mono: true },
          { label: "Reviewed", value: score.reviewed_count },
          { label: "Correct", value: score.correct_count },
          { label: "Incorrect", value: score.incorrect_count, muted: true },
          { label: "Partial", value: score.partially_correct_count, muted: true },
        ]
      : [
          { label: "Overall", value: "—", mono: true },
          { label: "Reviewed", value: "—" },
          { label: "Correct", value: "—" },
          { label: "Incorrect", value: "—", muted: true },
          { label: "Partial", value: "—", muted: true },
        ];

    const showFoot =
      !online ||
      emptyWindow ||
      byType.length > 0 ||
      allTimeScore != null;

    return (
      <section
        className="metric-strip metric-strip--compact w-full shrink-0"
        aria-label="Signal Score"
        aria-live="polite"
      >
        <div className="metric-strip-head">
          <div className="min-w-0">
            <p className="eyebrow">Signal Score</p>
            <p className="text-label-12 text-sio-fg-muted">{sourceLine}</p>
          </div>
          {windowControl || windowInvalid ? (
            <div className="metric-strip-window min-w-0">
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

        <dl className="metric-strip-kpis">
          {kpis.map((kpi) => (
            <CompactStat key={kpi.label} {...kpi} />
          ))}
        </dl>

        {showFoot ? (
          <div className="metric-strip-foot">
            {!online ? (
              <p className="w-full text-label-12 text-sio-fg-muted">
                Backend offline — score unavailable
              </p>
            ) : null}
            {emptyWindow ? (
              <p className="w-full text-label-12 text-sio-fg-muted">
                No reviews in this window. Mark signals in Shadow Mode to build
                the week score.
              </p>
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
                      {formatPercent(row.signal_score)}
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
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="metric-strip shrink-0"
      aria-label="Signal Score"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sio-border-base px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="eyebrow">Signal Score</p>
        <p className="text-label-12 text-sio-fg-muted">{sourceLine}</p>
      </div>
      {windowControl || windowInvalid ? (
        <div className="border-b border-sio-border-base px-3 py-2 sm:px-4">
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
                <span className="font-medium">{score.reviewed_count}</span>
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
                  className="flex min-w-0 items-baseline justify-between gap-3 text-copy-14"
                >
                  <span className="min-w-0 truncate text-sio-fg-base">
                    {typeLabel(row.signal_type)}
                  </span>
                  <span className="shrink-0 font-mono tabular text-sio-fg-subtle">
                    <span className="font-medium text-sio-fg-base">
                      {formatPercent(row.signal_score)}
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
    </section>
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
    <div className="min-w-0 px-1.5 py-2.5 sm:px-3">
      <dt className="metric-label break-words">{label}</dt>
      <dd
        className={`tabular mt-0.5 text-heading-16 ${mono ? "font-mono" : ""} ${muted ? "text-sio-fg-subtle" : "text-sio-fg-base"}`}
      >
        {value}
      </dd>
    </div>
  );
}
