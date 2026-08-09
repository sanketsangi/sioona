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
  const hint = online
    ? `${score.correct_count} correct · ${score.reviewed_count} reviewed`
    : "Backend offline — score unavailable";
  const byType = online ? score.by_signal_type : [];

  return (
    <section
      className="metric-strip shrink-0"
      aria-label="Signal Score"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ds-gray-400 px-4 py-2.5">
        <p className="eyebrow">Signal Score</p>
        <p className="text-label-12 text-ds-gray-900">
          {online ? "From Neon" : "Backend offline"}
        </p>
      </div>

      <div
        className={`grid divide-x divide-ds-gray-400 ${
          compact
            ? "grid-cols-1"
            : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
        }`}
      >
        <div className="metric-cell">
          <div className="metric-label">Overall</div>
          <div className="tabular mt-0.5 text-heading-20 text-ds-gray-1000">
            {primary}
          </div>
          <p className="mt-0.5 text-label-12 text-ds-gray-900">{hint}</p>
        </div>

        {!compact ? (
          <div className="min-w-0 px-4 py-3">
            <div className="metric-label">By Signal Type</div>
            {!online ? (
              <p className="mt-2 text-copy-14 text-ds-gray-900">
                Start the FastAPI backend to load Signal Score from Neon.
              </p>
            ) : byType.length === 0 ? (
              <p className="mt-2 text-copy-14 text-ds-gray-900">
                No reviews yet. Mark signals in Shadow Mode to build the score.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {byType.map((row) => (
                  <li
                    key={row.signal_type}
                    className="flex min-w-0 items-baseline justify-between gap-3 text-copy-14"
                  >
                    <span className="min-w-0 truncate text-ds-gray-1000">
                      {typeLabel(row.signal_type)}
                    </span>
                    <span className="shrink-0 tabular text-ds-gray-900">
                      <span className="font-medium text-ds-gray-1000">
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
        ) : null}
      </div>

      {compact && online && byType.length > 0 ? (
        <div className="border-t border-ds-gray-400 px-4 py-2.5">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-label-13 text-ds-gray-900">
            {byType.map((row) => (
              <li key={row.signal_type} className="tabular">
                <span className="text-ds-gray-1000">
                  {typeLabel(row.signal_type)}
                </span>{" "}
                {formatPercent(row.signal_score)}
                <span className="ml-1 text-label-12">
                  ({row.correct_count}/{row.reviewed_count})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
