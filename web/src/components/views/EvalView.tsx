import Link from "next/link";
import { AdaptationPanel } from "@/components/AdaptationPanel";
import { BaselineForm } from "@/components/BaselineForm";
import {
  EvalCard,
  evalCardHeaderClassName,
  evalCardPadClassName,
  evalMetricCellClassName,
} from "@/components/EvalCard";
import { ScoreWindowControl } from "@/components/ScoreWindowControl";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import { ViewFrame } from "@/components/ViewFrame";
import { ExportEvalPanel } from "@/components/views/ExportEvalPanel";
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
import type { SignalScoreWindow } from "@/lib/signal-score-window";
import { parseEvalPanel, viewHref, cadenceActionHref, type EvalPanel } from "@/lib/views";
import type { StoreData } from "@/lib/types";
import {
  cadenceActionCta,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";

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
  { id: "export", label: "Export eval" },
];

export function EvalView({
  store,
  panelRaw,
  labeledRaw,
  convPageRaw,
  adaptPageRaw,
  backendScore = null,
  allTimeScore = null,
  scoreWindow,
  cadenceAction,
  cadencePreviewId = null,
}: {
  store: StoreData;
  panelRaw?: string | null;
  labeledRaw?: string | null;
  convPageRaw?: string | null;
  adaptPageRaw?: string | null;
  /** Week-window SignalScore (drives go/no-go). */
  backendScore?: BackendSignalScore | null;
  /** Keep-set all-time score (display only; not go/no-go). */
  allTimeScore?: BackendSignalScore | null;
  scoreWindow: SignalScoreWindow;
  cadenceAction: PilotCadenceAction;
  cadencePreviewId?: string | null;
}) {
  const panel = parseEvalPanel(panelRaw);
  const metrics = applyBackendSignalScore(
    computeEvalMetrics(store),
    backendScore
  );
  const pilot = applyBackendSignalScoreToPilot(store, backendScore);
  const scoreFrom =
    scoreWindow.status === "custom" ? scoreWindow.dateInput : null;

  return (
    <ViewFrame className="gap-4">
      <SegmentedTabs
        label="Eval panels"
        activeId={panel}
        items={PANELS.map((item) => ({
          id: item.id,
          label: item.label,
          href: viewHref("eval", {
            panel: item.id,
            scoreFrom,
          }),
        }))}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panel === "metrics" ? (
          <MetricsPanel
            metrics={metrics}
            pilot={pilot}
            backendScore={backendScore}
            allTimeScore={allTimeScore}
            baselineOpportunities={store.pilot?.baselineOpportunities ?? 0}
            baselineNote={store.pilot?.baselineNote}
            scoreWindow={scoreWindow}
            scoreFrom={scoreFrom}
            cadenceAction={cadenceAction}
            cadencePreviewId={cadencePreviewId}
          />
        ) : null}
        {panel === "adapt" ? (
          <AdaptationPanel
            signals={store.signals}
            taxonomyOverrides={store.taxonomyOverrides ?? {}}
            compact
            adaptPageRaw={adaptPageRaw}
          />
        ) : null}
        {panel === "labeled" ? (
          <LabeledTables
            store={store}
            metrics={metrics}
            labeledRaw={labeledRaw}
            convPageRaw={convPageRaw}
          />
        ) : null}
        {panel === "export" ? <ExportEvalPanel /> : null}
      </div>
    </ViewFrame>
  );
}

function MetricsPanel({
  metrics,
  pilot,
  backendScore,
  allTimeScore,
  baselineOpportunities,
  baselineNote,
  scoreWindow,
  scoreFrom,
  cadenceAction,
  cadencePreviewId = null,
}: {
  metrics: EvalMetrics;
  pilot: PilotMetrics;
  backendScore: BackendSignalScore | null;
  allTimeScore: BackendSignalScore | null;
  baselineOpportunities: number;
  baselineNote?: string;
  scoreWindow: SignalScoreWindow;
  scoreFrom: string | null;
  cadenceAction: PilotCadenceAction;
  cadencePreviewId?: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SignalScoreSummary
        score={backendScore}
        allTimeScore={allTimeScore}
        compact
        windowLabel={scoreWindow.label}
        windowInvalid={scoreWindow.status === "invalid"}
        windowControl={<ScoreWindowControl window={scoreWindow} />}
      />

      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        <EvalCard>
          <div className={evalCardHeaderClassName}>
            <p className="eyebrow">Labeled Eval</p>
          </div>
          <div className="grid min-w-0 grid-cols-3 divide-x divide-sio-border-base overflow-hidden">
            <Metric
              label="P"
              value={formatPercent(metrics.labeledPrecision)}
              hint={`${metrics.truePositives} TP / ${metrics.falsePositives} FP`}
            />
            <Metric
              label="R"
              value={formatPercent(metrics.labeledRecall)}
              hint={`${metrics.falseNegatives} FN`}
            />
            <Metric
              label="Chats"
              value={String(metrics.labeledConversations)}
              hint={`${metrics.predictedSignals} pred.`}
            />
          </div>
        </EvalCard>

        <EvalCard>
          <div className={evalCardHeaderClassName}>
            <p className="eyebrow">Pilot</p>
            <p
              className={`tabular text-label-13 font-medium ${goNoGoClass(pilot.goNoGo)}`}
            >
              {goNoGoLabel(pilot.goNoGo)}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-3 divide-x divide-sio-border-base overflow-hidden">
            <Metric
              label="Opp."
              value={String(pilot.sioonaOpportunities)}
              hint={`Lift ${pilot.opportunityLift >= 0 ? "+" : ""}${pilot.opportunityLift}`}
            />
            <Metric
              label="Labeled"
              value={String(pilot.labeledOpportunities)}
              hint={`R ${formatPercent(pilot.labeledRecall)}`}
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
        </EvalCard>
      </div>

      <EvalCard className="shrink-0">
        <div className={`${evalCardPadClassName} py-2.5 sm:py-3`}>
          <p className="line-clamp-3 text-pretty text-label-13 text-sio-fg-subtle">
            {pilot.offerSummary}
            {pilot.goNoGo === "insufficient_data" ||
            pilot.reviewedCount < 5 ? (
              <>
                {" "}
                Need ≥5 reviews in this window — open{" "}
                <Link
                  href={viewHref("insights", { scoreFrom })}
                  className="link-accent"
                >
                  Insights
                </Link>
                .
              </>
            ) : pilot.goNoGo === "go" ? (
              <>
                {" "}
                Share{" "}
                <span className="text-sio-fg-base">
                  {formatPercent(pilot.reviewPrecision)} Signal Score
                </span>
                . {pilotCadenceHelperCopy("eval", cadenceAction)}{" "}
                <Link
                  href={cadenceActionHref(cadenceAction, {
                    scoreFrom,
                    preview: cadencePreviewId,
                  })}
                  className="link-accent"
                >
                  {cadenceActionCta(cadenceAction)}
                </Link>
              </>
            ) : (
              <> Hold until precision ≥80% — use Adapt, then re-review.</>
            )}
          </p>
        </div>
      </EvalCard>

      <div className="shrink-0">
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
    <div className={evalMetricCellClassName}>
      <div className="metric-label">{label}</div>
      <div className="tabular mt-0.5 text-heading-16 text-sio-fg-base">
        {value}
      </div>
      <div className="mt-0.5 line-clamp-2 break-words text-pretty text-label-12 text-sio-fg-muted">
        {hint}
      </div>
    </div>
  );
}
