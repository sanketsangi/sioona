import Link from "next/link";
import { AdaptationPanel } from "@/components/AdaptationPanel";
import { BaselineForm } from "@/components/BaselineForm";
import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import { LabeledTables } from "@/components/views/LabeledTables";
import type { BackendSignalScore } from "@/lib/backend-client";
import {
  applyBackendSignalScore,
  applyBackendSignalScoreToPilot,
  computeEvalMetrics,
  type EvalMetrics,
  type PilotMetrics,
} from "@/lib/eval";
import { formatPercent } from "@/lib/format";
import {
  parseEvalPanel,
  viewHref,
  type EvalPanel,
} from "@/lib/views";
import type { StoreData } from "@/lib/types";

function goNoGoLabel(value: "go" | "hold" | "insufficient_data"): string {
  switch (value) {
    case "go":
      return "Go";
    case "hold":
      return "Hold";
    case "insufficient_data":
      return "Insufficient Data";
  }
}

function goNoGoClass(value: "go" | "hold" | "insufficient_data"): string {
  switch (value) {
    case "go":
      return "text-sio-status-success-fg";
    case "hold":
      return "text-sio-status-warning-fg";
    case "insufficient_data":
      return "text-sio-fg-subtle";
  }
}

const PANELS: { id: EvalPanel; label: string }[] = [
  { id: "metrics", label: "Metrics" },
  { id: "adapt", label: "Adapt" },
  { id: "labeled", label: "Labeled" },
];

export function EvalView({
  store,
  panelRaw,
  labeledRaw,
  convPageRaw,
  adaptPageRaw,
  backendScore = null,
}: {
  store: StoreData;
  panelRaw?: string | null;
  labeledRaw?: string | null;
  convPageRaw?: string | null;
  adaptPageRaw?: string | null;
  backendScore?: BackendSignalScore | null;
}) {
  const panel = parseEvalPanel(panelRaw);
  const metrics = applyBackendSignalScore(
    computeEvalMetrics(store),
    backendScore
  );
  const pilot = applyBackendSignalScoreToPilot(store, backendScore);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
      <div
        className="flex min-w-0 shrink-0 flex-wrap gap-0.5 rounded-md border border-sio-border-base p-1"
        role="group"
        aria-label="Eval panels"
      >
        {PANELS.map((item) => {
          const active = panel === item.id;
          return (
            <Link
              key={item.id}
              href={viewHref("eval", { panel: item.id })}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`nav-link flex-1 sm:flex-none ${active ? "nav-link-active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panel === "metrics" ? (
          <MetricsPanel
            metrics={metrics}
            pilot={pilot}
            backendScore={backendScore}
            baselineOpportunities={store.pilot?.baselineOpportunities ?? 0}
            baselineNote={store.pilot?.baselineNote}
          />
        ) : null}
        {panel === "adapt" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AdaptationPanel
              signals={store.signals}
              taxonomyOverrides={store.taxonomyOverrides ?? {}}
              compact
              adaptPageRaw={adaptPageRaw}
            />
          </div>
        ) : null}
        {panel === "labeled" ? (
          <LabeledTables
            store={store}
            metrics={metrics}
            labeledRaw={labeledRaw}
            convPageRaw={convPageRaw}
          />
        ) : null}
      </div>
    </div>
  );
}

function MetricsPanel({
  metrics,
  pilot,
  backendScore,
  baselineOpportunities,
  baselineNote,
}: {
  metrics: EvalMetrics;
  pilot: PilotMetrics;
  backendScore: BackendSignalScore | null;
  baselineOpportunities: number;
  baselineNote?: string;
}) {
  return (
    <div className="scroll-region flex min-h-0 flex-1 flex-col gap-4">
      <SignalScoreSummary score={backendScore} />

      <section className="metric-strip shrink-0">
        <div className="border-b border-sio-border-base px-4 py-2.5">
          <p className="eyebrow">Labeled Eval</p>
        </div>
        <div className="grid grid-cols-1 divide-y divide-sio-border-base sm:grid-cols-2 sm:divide-x lg:grid-cols-3 lg:divide-y-0">
          <Metric
            label="Labeled P"
            value={formatPercent(metrics.labeledPrecision)}
            hint={`${metrics.truePositives} TP / ${metrics.falsePositives} FP`}
          />
          <Metric
            label="Labeled R"
            value={formatPercent(metrics.labeledRecall)}
            hint={`${metrics.falseNegatives} FN`}
          />
          <Metric
            label="Labeled Chats"
            value={String(metrics.labeledConversations)}
            hint={`${metrics.predictedSignals} predictions`}
          />
        </div>
      </section>

      <section className="metric-strip shrink-0">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-sio-border-base px-4 py-2.5">
          <p className="eyebrow">Pilot</p>
          <p className={`tabular text-label-14 font-medium ${goNoGoClass(pilot.goNoGo)}`}>
            {goNoGoLabel(pilot.goNoGo)}
          </p>
        </div>
        <div className="grid grid-cols-1 divide-y divide-sio-border-base sm:grid-cols-2 sm:divide-x lg:grid-cols-3 lg:divide-y-0">
          <Metric
            label="Opportunities"
            value={String(pilot.sioonaOpportunities)}
            hint={`Lift ${pilot.opportunityLift >= 0 ? "+" : ""}${pilot.opportunityLift} vs ${pilot.baselineOpportunities}`}
          />
          <Metric
            label="Labeled Opp."
            value={String(pilot.labeledOpportunities)}
            hint={`Recall ${formatPercent(pilot.labeledRecall)}`}
          />
          <Metric
            label="P Target"
            value={formatPercent(pilot.reviewPrecisionTarget)}
            hint={
              pilot.meetsReviewPrecisionTarget === null
                ? `${pilot.reviewedCount} reviews`
                : pilot.meetsReviewPrecisionTarget
                  ? "Met"
                  : "Below"
            }
          />
        </div>
      </section>

      <div className="surface-quiet shrink-0 px-4 py-3">
        <p className="text-copy-14 text-sio-fg-subtle">{pilot.offerSummary}</p>
        {pilot.reviewedCount < 5 ? (
          <p className="mt-2 text-copy-14 text-sio-fg-subtle">
            Need ≥5 SignalScore reviews. Open{" "}
            <Link href={viewHref("insights")} className="link-accent">
              Insights
            </Link>
            , then return here.
          </p>
        ) : pilot.goNoGo === "go" ? (
          <p className="mt-2 text-copy-14 text-sio-fg-subtle">
            Share{" "}
            <span className="text-sio-fg-base">
              {formatPercent(pilot.reviewPrecision)} Signal Score
            </span>{" "}
            · ask for a 2-week Shadow Mode pilot.
          </p>
        ) : (
          <p className="mt-2 text-copy-14 text-sio-fg-subtle">
            Hold expansion until review precision hits ≥80%. Use Adapt, then
            re-review.
          </p>
        )}
      </div>

      <div className="min-h-0 shrink-0 pb-1">
        <BaselineForm
          baselineOpportunities={baselineOpportunities}
          baselineNote={baselineNote}
          compact
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="metric-cell min-w-0">
      <div className="metric-label">{label}</div>
      <div className="tabular mt-0.5 text-heading-20 text-sio-fg-base">
        {value}
      </div>
      <div className="mt-0.5 truncate text-label-12 text-sio-fg-subtle">{hint}</div>
    </div>
  );
}
