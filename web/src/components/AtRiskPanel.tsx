import { EARLY_WARNING_LABEL, type EarlyWarning } from "@/lib/early-warning";

export function AtRiskPanel({ warnings }: { warnings: EarlyWarning[] }) {
  if (warnings.length === 0) return null;
  const rows = warnings.slice(0, 8);
  return (
    <section
      aria-labelledby="at-risk-heading"
      className="rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-4"
    >
      <h2 id="at-risk-heading" className="text-copy-14 font-medium text-sio-fg-base">
        At risk
      </h2>
      <p className="mt-1 text-label-12 text-sio-fg-muted">
        Patterns that show up before someone says they are leaving. Not
        included in SignalScore.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((warning) => (
          <li key={warning.id} className="min-w-0">
            <p className="text-label-12 text-sio-fg-muted">
              <span translate="no">{warning.customerLabel}</span>
              {" · "}
              {EARLY_WARNING_LABEL[warning.kind]}
            </p>
            <p className="text-copy-14 text-sio-fg-base">{warning.reason}</p>
            {warning.quote ? (
              <p className="mt-0.5 truncate text-label-12 text-sio-fg-muted" translate="no">
                “{warning.quote}”
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
