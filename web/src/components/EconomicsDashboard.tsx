import type { BackendEconomicsDashboard } from "@/lib/backend-client";

const integer = new Intl.NumberFormat("en-IN");
const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function ratio(value: number | null) {
  return value == null ? "Unavailable" : percent.format(value);
}

function money(value: string | null) {
  return value == null ? "Unavailable" : usd.format(Number(value));
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Panel({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="mb-4">
        <h2 id={id} className="scroll-mt-20 text-balance text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function EconomicsDashboard({ data }: { data: BackendEconomicsDashboard }) {
  const { funnel, quality, reliability, economics } = data;
  const funnelNote = (key: string) => {
    const denominator = funnel.denominators[key];
    const basis = funnel.definitions[key];
    return denominator == null ? basis : `Denominator: ${integer.format(denominator)} · ${basis}`;
  };
  const windowLabel = `${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: data.timezone }).format(new Date(data.from_ts))} – ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: data.timezone }).format(new Date(data.to_ts))}`;
  return (
    <div className="space-y-5 pb-8">
      <div aria-label="Dashboard reporting basis" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Window: <span className="font-medium text-foreground">{windowLabel}</span> · Timezone: <span translate="no">IST</span> · Costs: <span translate="no">USD</span> · Influenced value: <span translate="no">INR</span>
      </div>

      <Panel id="funnel" title="Funnel" description="Counts use the timestamp basis shown in each metric’s definition; stages are not presented as a single event cohort.">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Ingested" value={integer.format(funnel.ingested)} note={funnelNote("ingested")} />
          <Metric label="Processed" value={integer.format(funnel.processed)} note={funnelNote("processed")} />
          <Metric label="Surfaced" value={integer.format(funnel.surfaced)} note={funnelNote("surfaced")} />
          <Metric label="Reviewed" value={integer.format(funnel.reviewed)} note={funnelNote("reviewed")} />
          <Metric label="Correct" value={integer.format(funnel.correct)} note={funnelNote("correct")} />
          <Metric label="Acted" value={integer.format(funnel.acted)} note={funnelNote("acted")} />
          <Metric label="Positive outcomes" value={integer.format(funnel.positive_outcomes)} note={funnelNote("positive_outcomes")} />
          <Metric label="Influenced value" value={inr.format(Number(funnel.influenced_value_inr))} note={funnelNote("influenced_value_inr")} />
        </dl>
      </Panel>

      <Panel id="quality" title="Signal quality" description="Human acceptance and evidence health from canonical predictions and feedback.">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="SignalScore" value={ratio(quality.signal_score)} note="Correct ÷ reviewed" />
          <Metric label="False-positive rate" value={ratio(quality.false_positive_rate)} note="Incorrect ÷ reviewed" />
          <Metric label="Evidence failure rate" value={ratio(quality.evidence_failure_rate)} note={`${integer.format(quality.evidence_unresolved + quality.evidence_stale)} stale or unresolved`} />
          <Metric label="Abstention rate" value={ratio(quality.abstention_rate)} note={`${integer.format(quality.abstained)} completed run(s) without a surfaced signal`} />
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Human acceptance by signal type</caption>
            <thead><tr className="border-b border-border"><th scope="col" className="py-2">Signal type</th><th scope="col" className="py-2 text-right">Reviewed</th><th scope="col" className="py-2 text-right">Correct</th><th scope="col" className="py-2 text-right">Acceptance</th></tr></thead>
            <tbody>{quality.by_signal_type.length ? quality.by_signal_type.map((row) => <tr className="border-b border-border/60" key={row.signal_type}><th scope="row" className="py-2 font-medium" translate="no">{row.signal_type}</th><td className="py-2 text-right tabular-nums">{integer.format(row.reviewed)}</td><td className="py-2 text-right tabular-nums">{integer.format(row.correct)}</td><td className="py-2 text-right tabular-nums">{ratio(row.acceptance_rate)}</td></tr>) : <tr><td colSpan={4} className="py-4 text-muted-foreground">No reviewed signals in this window.</td></tr>}</tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Gold-set precision, recall, and calibration: <strong className="font-medium text-foreground">Unavailable</strong> — {quality.gold_set_precision.reason}</p>
      </Panel>

      <Panel id="reliability" title="Reliability" description="Queue, provider-attempt, retry, error, and latency health.">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Queue depth" value={integer.format(reliability.queue_depth)} note={reliability.oldest_queue_age_seconds == null ? "No queued work" : `Oldest: ${integer.format(reliability.oldest_queue_age_seconds)} seconds`} />
          <Metric label="Recovered jobs" value={integer.format(reliability.recovered_jobs)} note="Jobs with more than one attempt" />
          <Metric label="Retry rate" value={ratio(reliability.retry_rate)} note={`${integer.format(reliability.retry_or_fallback_attempts)} retry or fallback attempt(s)`} />
          <Metric label="Error rate" value={ratio(reliability.error_rate)} note={`${integer.format(reliability.http_429_attempts)} provider 429 response(s)`} />
          <Metric label="p50 provider latency" value={reliability.p50_latency_ms == null ? "Unavailable" : `${integer.format(reliability.p50_latency_ms)} ms`} />
          <Metric label="p95 provider latency" value={reliability.p95_latency_ms == null ? "Unavailable" : `${integer.format(reliability.p95_latency_ms)} ms`} />
          <Metric label="Unfinished attempts" value={integer.format(reliability.unfinished_attempts)} />
          <Metric label="Durable telemetry gaps" value="4 unavailable" note="Flush failures, reservation drift, DB latency, connector errors" />
        </dl>
      </Panel>

      <Panel id="economics" title="Economics" description="Known measured cost only; unknown usage and cost are never treated as zero.">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Known cost" value={money(economics.known_cost_usd)} note={`${money(economics.estimated_cost_usd)} estimated · ${money(economics.reconciled_cost_usd)} reconciled`} />
          <Metric label="Cost coverage" value={ratio(economics.known_cost_coverage)} note={`${integer.format(economics.unknown_cost_count)} attempt(s) unknown`} />
          <Metric label="Unknown usage" value={ratio(economics.unknown_usage_rate)} note={`${integer.format(economics.unknown_usage_count)} attempt(s)`} />
          <Metric label="Cost / processed conversation" value={money(economics.cost_per_processed_conversation_usd)} />
          <Metric label="Input tokens" value={integer.format(economics.input_tokens)} />
          <Metric label="Cached input tokens" value={integer.format(economics.cached_input_tokens)} />
          <Metric label="Output tokens" value={integer.format(economics.output_tokens)} />
          <Metric label="Cost / correct signal" value={money(economics.cost_per_correct_signal_usd)} />
        </dl>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {economics.projections.map((projection) => <div key={projection.conversations} className="rounded-lg border border-border p-4"><h3 className="text-sm font-medium">{projection.conversations / 1000}K conversations</h3><p className="mt-1 text-xl font-semibold tabular-nums">{money(projection.estimated_cost_usd)}</p><p className="mt-1 text-xs text-muted-foreground">{projection.status === "unavailable" ? "Unavailable: no processed conversations or known costs." : projection.incomplete ? "Incomplete estimate · unknown costs excluded." : "Measured known-cost projection."}</p></div>)}
        </div>
      </Panel>

      <Panel id="alerts" title="Alerts and instrumentation" description="Every condition has an owner and a runbook line; unsupported telemetry stays explicit.">
        <ul className="grid gap-3 lg:grid-cols-2">{data.alerts.map((alert) => <li key={alert.key} className="rounded-lg border border-border p-4"><div className="flex min-w-0 items-start justify-between gap-3"><h3 className="min-w-0 break-words font-medium">{alert.label}</h3><span className="shrink-0 rounded-full border border-current px-2 py-0.5 text-xs font-semibold uppercase" aria-label={`Status: ${alert.status}`}>{alert.status}</span></div><p className="mt-2 text-sm text-muted-foreground">{alert.detail}</p><p className="mt-2 text-xs"><strong>Owner:</strong> {alert.owner} · <strong>Runbook:</strong> {alert.runbook}</p></li>)}</ul>
      </Panel>
    </div>
  );
}
