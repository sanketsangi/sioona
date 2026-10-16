import Link from "next/link";
import { AdaptationPanel } from "@/components/AdaptationPanel";
import { EvalTabLink } from "@/components/EvalTabLink";
import { BaselineForm } from "@/components/BaselineForm";
import {
  EvalCard,
  EvalMetric,
  evalCardHeaderClassName,
} from "@/components/EvalCard";
import { ScoreWindowControl } from "@/components/ScoreWindowControl";
import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { evalSyncWarningWhenReviewsDisagree } from "@/lib/prediction-sync";
import { isLivePartnerKeepSet } from "@/lib/vault-file";
import { quarantineDisplayEvidence } from "@/lib/server-evidence";
import type { StoreData } from "@/lib/types";
import {
  cadenceActionCta,
  PILOT_MIN_REVIEWS,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";

const PANELS: { id: EvalPanel; label: string }[] = [
  { id: "metrics", label: "Metrics" },
  { id: "adapt", label: "Improvements" },
  { id: "labeled", label: "Reviewed examples" },
  { id: "export", label: "Export evaluation" },
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
  syncFailed = 0,
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
  /** URL `syncFailed` while unsynced predictions remain. */
  syncFailed?: number;
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
    <ViewFrame className="gap-4 overflow-y-auto">
      <p className="shrink-0 max-w-prose text-copy-14 text-sio-fg-subtle">SignalScore is Correct ÷ all reviewed detections in the selected window. Partially correct reviews count in the denominator, not as Correct. Pending synchronization is excluded from persisted totals. All-time scores are context only.</p>
      <Tabs
        value={panel}
        activationMode="manual"
        className="min-h-0 min-w-0 flex-1 gap-4 md:gap-6"
      >
        <TabsList
          aria-label="Eval panels"
          className="!h-9 w-full shrink-0 border border-border"
        >
          {PANELS.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              asChild
              className="min-w-0"
            >
              <EvalTabLink
                href={viewHref("eval", {
                  panel: item.id,
                  scoreFrom,
                })}
              >
                <span className="truncate">{item.label}</span>
              </EvalTabLink>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent
          value={panel}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
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
              syncWarning={evalSyncWarningWhenReviewsDisagree({
                syncFailed,
                signals: store.signals,
                conversationCount: store.conversations.length,
                neonReviewedCount: backendScore?.reviewed_count ?? null,
              })}
            />
          ) : null}
          {panel === "adapt" ? (
            <><p className="mb-3 text-copy-14 text-sio-fg-subtle">Suggestions below are proposals. They do not establish that a taxonomy or prompt change has passed an evaluation.</p><AdaptationPanel
              signals={store.signals.map(quarantineDisplayEvidence)}
              taxonomyOverrides={store.taxonomyOverrides ?? {}}
              compact
              adaptPageRaw={adaptPageRaw}
              hideSampleAdapt={isLivePartnerKeepSet(
                store.pilot?.lastUploadedFileName,
              )}
            /></>
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
        </TabsContent>
      </Tabs>
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
  syncWarning = null,
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
  syncWarning?: string | null;
}) {
  const online = backendScore !== null;
  const liftSign = pilot.opportunityLift >= 0 ? "+" : "";
  const liftHint = `${pilot.sioonaOpportunities} found − ${pilot.baselineOpportunities} baseline`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {syncWarning ? (
        <p className="text-copy-14 text-sio-fg-base" role="alert">
          {syncWarning}
        </p>
      ) : null}
      <SignalScoreSummary
        score={backendScore}
        allTimeScore={allTimeScore}
        compact
        windowLabel={scoreWindow.label}
        windowInvalid={scoreWindow.status === "invalid"}
        windowControl={
          <ScoreWindowControl
            window={scoreWindow}
            firstReviewedAt={
              backendScore && backendScore.reviewed_count > 0
                ? backendScore.first_reviewed_at
                : null
            }
            lastReviewedAt={
              backendScore && backendScore.reviewed_count > 0
                ? backendScore.last_reviewed_at
                : null
            }
          />
        }
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
        <div className="grid min-w-0 grid-cols-2 divide-x divide-sio-border-base overflow-hidden">
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
