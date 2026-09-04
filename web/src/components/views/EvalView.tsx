import Link from "next/link";
import { AdaptationPanel } from "@/components/AdaptationPanel";
import { BaselineForm } from "@/components/BaselineForm";
import {
  EvalCard,
  EvalMetric,
  evalCardHeaderClassName,
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
  type PilotGoNoGo,
  type PilotMetrics,
} from "@/lib/eval";
import { formatPercent } from "@/lib/format";
import type { SignalScoreWindow } from "@/lib/signal-score-window";
import { parseEvalPanel, viewHref, cadenceActionHref, type EvalPanel } from "@/lib/views";
import type { StoreData } from "@/lib/types";
import {
  cadenceActionCta,
  PILOT_MIN_REVIEWS,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";

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
  const online = backendScore !== null;
  const liftSign = pilot.opportunityLift >= 0 ? "+" : "";
  const liftHint =
    pilot.baselineOpportunities > 0
      ? `${pilot.sioonaOpportunities} found − ${pilot.baselineOpportunities} baseline`
      : "Set partner baseline for share-out";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SignalScoreSummary
        score={backendScore}
        allTimeScore={allTimeScore}
        compact
        windowLabel={scoreWindow.label}
        windowInvalid={scoreWindow.status === "invalid"}
        windowControl={<ScoreWindowControl window={scoreWindow} />}
        goNoGo={online ? pilot.goNoGo : undefined}
        cadence={
          <MetricsCadence
            online={online}
            goNoGo={pilot.goNoGo}
            reviewPrecision={pilot.reviewPrecision}
            reviewedCount={pilot.reviewedCount}
            cadenceAction={cadenceAction}
            cadencePreviewId={cadencePreviewId}
            scoreFrom={scoreFrom}
          />
        }
      />

      <EvalCard className="shrink-0">
        <div className={evalCardHeaderClassName}>
          <p className="eyebrow">Pilot</p>
        </div>
        <div className="grid min-w-0 grid-cols-3 divide-x divide-sio-border-base overflow-hidden">
          <EvalMetric
            label="Opp."
            value={String(pilot.sioonaOpportunities)}
            hint="Conversations with a signal"
          />
          <EvalMetric
            label="Lift vs baseline"
            value={`${liftSign}${pilot.opportunityLift}`}
            hint={liftHint}
          />
          <EvalMetric
            label="P Target"
            value={formatPercent(pilot.reviewPrecisionTarget)}
            hint={
              !online || pilot.meetsReviewPrecisionTarget === null
                ? `${pilot.reviewedCount} reviews`
                : pilot.meetsReviewPrecisionTarget
                  ? "Met"
                  : "Below"
            }
          />
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

function MetricsCadence({
  online,
  goNoGo,
  reviewPrecision,
  reviewedCount,
  cadenceAction,
  cadencePreviewId = null,
  scoreFrom,
}: {
  online: boolean;
  goNoGo: PilotGoNoGo;
  reviewPrecision: number | null;
  reviewedCount: number;
  cadenceAction: PilotCadenceAction;
  cadencePreviewId?: string | null;
  scoreFrom: string | null;
}) {
  const insightsHref = viewHref("insights", {
    scoreFrom,
    preview: cadencePreviewId,
  });
  const cadenceHref = cadenceActionHref(cadenceAction, {
    scoreFrom,
    preview: cadencePreviewId,
  });
  const cadenceLink = (href: string, label: string) => (
    <Link href={href} className="link-accent">
      {label}
    </Link>
  );

  if (!online) {
    return (
      <>
        {pilotCadenceHelperCopy("eval", cadenceAction)}{" "}
        {cadenceLink(cadenceHref, cadenceActionCta(cadenceAction))}
      </>
    );
  }

  if (goNoGo === "hold") {
    return (
      <>
        Hold until SignalScore ≥80% — continue reviews in Insights.{" "}
        {cadenceLink(insightsHref, "Open Insights")}
      </>
    );
  }

  if (goNoGo === "insufficient_data" || reviewedCount < PILOT_MIN_REVIEWS) {
    return (
      <>
        Need ≥{PILOT_MIN_REVIEWS} reviews in this window.{" "}
        {cadenceLink(insightsHref, "Open Insights")}
      </>
    );
  }

  return (
    <>
      Share{" "}
      <span className="text-sio-fg-base">
        {formatPercent(reviewPrecision)} Signal Score
      </span>
      . {pilotCadenceHelperCopy("eval", cadenceAction)}{" "}
      {cadenceLink(cadenceHref, cadenceActionCta(cadenceAction))}
    </>
  );
}
