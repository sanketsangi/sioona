import type { BackendSignalScore } from "@/lib/backend-client";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import type { SignalType } from "@/lib/types";

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
 * `compact` = dense single-strip (Eval) — no stacked header/
 * body/footer chrome; full layout keeps the two-column metric panel.
 * Signal Detail omits this strip (score lives on Insights/Eval).
 */
export function SignalScoreSummary({
  score,
  compact = false,
}: {
  score: BackendSignalScore | null;
  compact?: boolean;
}) {
  const online = score !== null;
  const primary = online ? formatPercent(score.signal_score) : "—";
  const byType = online ? score.by_signal_type : [];

  if (compact) {
    return (
      <section
        className="metric-strip metric-strip--compact shrink-0"
        aria-label="Signal Score"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="eyebrow">Signal Score</p>
          <p className="text-label-12 text-sio-fg-muted">
            {online ? "From Neon" : "Backend offline"}
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="metric-label">Overall</span>
            <span className="font-mono tabular text-heading-16 text-sio-fg-base">
              {primary}
            </span>
            {online ? (
              <p className="tabular text-label-12 text-sio-fg-base">
                Reviewed{" "}
                <span className="font-medium">{score.reviewed_count}</span>
                <span className="text-sio-fg-subtle"> · </span>
                Correct{" "}
                <span className="font-medium">{score.correct_count}</span>
                <span className="text-sio-fg-muted">
                  {" "}
                  · Incorrect {score.incorrect_count}
                  <span aria-hidden> · </span>
                  Partial {score.partially_correct_count}
                </span>
              </p>
            ) : (
              <p className="text-label-12 text-sio-fg-muted">
                Backend offline — score unavailable
              </p>
            )}
          </div>

          {online && byType.length > 0 ? (
            <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-label-12 text-sio-fg-subtle">
              {byType.map((row) => (
                <li key={row.signal_type} className="font-mono tabular">
                  <span className="font-sans text-sio-fg-base">
                    {typeLabel(row.signal_type)}
                  </span>{" "}
                  {formatPercent(row.signal_score)}
                  <span className="ml-1 text-label-12 text-sio-fg-muted">
                    ({row.correct_count}/{row.reviewed_count})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {online && byType.length === 0 ? (
            <p className="text-label-12 text-sio-fg-muted">
              No reviews yet. Mark signals in Shadow Mode to build the score.
            </p>
          ) : null}
        </div>
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
        <p className="text-label-12 text-sio-fg-muted">
          {online ? "From Neon" : "Backend offline"}
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:divide-x sm:divide-sio-border-base">
        <div className="metric-cell">
          <div className="metric-label">Overall</div>
          <div className="font-mono tabular mt-0.5 text-heading-24 text-sio-fg-base">
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
