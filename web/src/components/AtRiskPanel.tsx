import { EvalCard, evalMetricCellClassName } from "@/components/EvalCard";
import { EARLY_WARNING_LABEL, type EarlyWarning } from "@/lib/early-warning";
import { cn } from "@/lib/utils";

/** One-line rows so the strip stays near the queue metrics card height. */
const VISIBLE_WARNINGS = 3;

export function AtRiskPanel({ warnings }: { warnings: EarlyWarning[] }) {
  if (warnings.length === 0) return null;
  const rows = warnings.slice(0, VISIBLE_WARNINGS);
  const hidden = warnings.length - rows.length;

  return (
    <section aria-labelledby="at-risk-heading" className="shrink-0">
      <EvalCard>
        <div
          className={cn(
            evalMetricCellClassName,
            "flex min-w-0 flex-col gap-1.5",
          )}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2
              id="at-risk-heading"
              className="truncate text-label-12 font-medium text-sio-fg-subtle"
            >
              At risk
            </h2>
            <p className="tabular text-heading-16 text-sio-fg-base">
              {warnings.length}
            </p>
          </div>
          <p className="truncate text-label-12 text-sio-fg-muted">
            Not included in SignalScore.
          </p>
          <ul className="m-0 flex min-w-0 list-none flex-col gap-0.5 p-0">
            {rows.map((warning) => (
              <li
                key={warning.id}
                className="min-w-0 truncate text-label-12 text-sio-fg-base"
              >
                <span translate="no">{warning.customerLabel}</span>
                {" · "}
                <span className="text-sio-fg-muted">
                  {EARLY_WARNING_LABEL[warning.kind]}
                </span>
              </li>
            ))}
            {hidden > 0 ? (
              <li className="sr-only">
                {hidden} more
              </li>
            ) : null}
          </ul>
        </div>
      </EvalCard>
    </section>
  );
}
