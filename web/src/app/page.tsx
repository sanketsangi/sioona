import type { Metadata } from "next";
import type { ReactNode } from "react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  fetchNeedsReview,
  type NeedsReviewResult,
} from "@/lib/fetch-needs-review";
import {
  fetchTenantSignals,
  type TenantSignalsResult,
} from "@/lib/fetch-tenant-signals";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import {
  fetchOverlayConversations,
  mergeOverlayChats,
} from "@/lib/hydrate-conversations";
import { persistDeferredPredictionSync } from "@/lib/defer-prediction-sync";
import {
  platformPageFetches,
  shouldAwaitHomepagePilotRefresh,
  shouldDeferHomepagePilotRefresh,
  shouldDeferHomepagePredictionSync,
} from "@/lib/platform-page-data";
import {
  applyChatEvidenceToSignals,
  filterPendingWithChat,
  followUpSignals,
  keepSetConversationIds,
  signalScoreConversationIds,
  missingConversationIds,
  pendingQueueSignals,
  reviewedQueueSignals,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { buildHeaderNotifications } from "@/lib/notifications";
import {
  parseLlmAddedParam,
  parseLlmFailedParam,
} from "@/lib/detect-llm-query";
import {
  parseSyncCreatedParam,
  parseSyncFailedParam,
  shouldShowSyncFailureBanner,
} from "@/lib/prediction-sync";
import {
  computePilotCadenceSteps,
  firstUnactedCorrectId,
  hasMidWeekExport,
  hasPilotBaseline,
  nextPilotCadenceAction,
} from "@/lib/pilot-cadence";
import { inspectSignalScoreWindow } from "@/lib/signal-score-window";
import { loadStore, writeStore } from "@/lib/store";
import { ensureSupervisedActions } from "@/lib/supervised-actions";
import {
  persistDeferredPilotRefresh,
  persistHealedPilot,
  refreshStorePilotFromNeon,
} from "@/lib/sync-pilot";
import {
  isActionModeUnlocked,
  parseActionFilter,
  parseMode,
  parsePage,
  parseReplacedParam,
  parseTypeFilter,
  parseView,
  resolveInsightsStatusFilter,
  resolveWorkspaceMode,
  type PlatformView,
} from "@/lib/views";
import {
  isVaultBatchRenderable,
  parseVaultFile,
  resolveHeaderBatchName,
  resolveInsightsVaultFile,
} from "@/lib/vault-file";

export const dynamic = "force-dynamic";

const TITLES: Record<PlatformView, string> = {
  insights: "Insights",
  upload: "Uploaded Chats",
  eval: "Eval & SignalScore",
  taxonomy: "Signal Taxonomy",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; preview?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const view = parseView(sp.view);
  if (view === "insights" && sp.preview) {
    return { title: "Signal Review" };
  }
  return { title: TITLES[view] };
}

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    signal?: string;
    panel?: string;
    demo?: string;
    imported?: string;
    signals?: string;
    status?: string;
    type?: string;
    action?: string;
    page?: string;
    taxPage?: string;
    msgPage?: string;
    labeled?: string;
    convPage?: string;
    adaptPage?: string;
    syncFailed?: string;
    syncCreated?: string;
    llmAdded?: string;
    llmFailed?: string;
    preview?: string;
    scoreFrom?: string;
    wipeFailed?: string;
    mode?: string;
    replaced?: string;
    file?: string;
  }>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const signalId = sp.signal ?? null;
  const unlocked = isActionModeUnlocked();

  // Locked prod: `?mode=action` deep-links bounce to Shadow (strip mode).
  if (parseMode(sp.mode) === "action" && !unlocked) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "mode") continue;
      if (typeof value === "string" && value !== "") {
        params.set(key, value);
      }
    }
    if (!params.has("view")) params.set("view", view);
    redirect(`/?${params.toString()}`);
  }

  const workspaceMode = resolveWorkspaceMode(sp.mode, unlocked);

  // Legacy `?signal=` → in-queue expand via `?preview=`
  if (signalId) {
    const params = new URLSearchParams();
    params.set("view", "insights");
    params.set("preview", signalId);
    for (const [key, value] of Object.entries(sp)) {
      if (key === "signal" || key === "preview" || key === "view") continue;
      if (typeof value === "string" && value !== "") {
        params.set(key, value);
      }
    }
    redirect(`/?${params.toString()}`);
  }

  const previewId = sp.preview ?? null;
  const syncFailed = parseSyncFailedParam(sp.syncFailed);
  const syncCreated = parseSyncCreatedParam(sp.syncCreated);
  const wipeFailed = sp.wipeFailed === "1";
  const jsonKeepSet = parseReplacedParam(sp.replaced);
  const scoreWindow = inspectSignalScoreWindow({
    scoreFrom: sp.scoreFrom,
    envFrom: process.env.SIGNAL_SCORE_FROM,
  });
  const scoreDateFrom = scoreWindow.resolvedFrom;

  const fetches = platformPageFetches(view);
  const skippedNeedsReview: NeedsReviewResult = { ok: true, predictions: [] };
  const skippedTenantSignals: TenantSignalsResult = { ok: true, rows: [] };
  // Never await POST /v1/predictions on GET / — Insights/Eval first paint
  // uses GET needs-review / GET signals. Dual-write runs after the response
  // on cold start only.
  const { store: storeRaw, coldStart } = await loadStore({
    syncPredictions: false,
  });
  if (shouldDeferHomepagePredictionSync(fetches.predictionSync, coldStart)) {
    after(() => {
      void persistDeferredPredictionSync(storeRaw.tenant.id).catch((err) => {
        const detail = err instanceof Error ? err.message : "unknown error";
        console.warn(`[defer-prediction-sync] ${detail}`);
      });
    });
  }
  // Insights/Eval first paint uses needs-review / signals, not /pilot.
  // Header filename + cadence helper read JSON; heal Neon after the response.
  if (shouldDeferHomepagePilotRefresh(fetches.pilotRefresh)) {
    after(() => {
      void persistDeferredPilotRefresh(storeRaw.tenant.id).catch((err) => {
        const detail = err instanceof Error ? err.message : "unknown error";
        console.warn(`[defer-pilot-refresh] ${detail}`);
      });
    });
  }

  // Upload awaits live /pilot for cadence chrome. Insights/Eval/Taxonomy
  // render from the JSON snapshot (skip or after() above).
  const store = shouldAwaitHomepagePilotRefresh(fetches.pilotRefresh)
    ? await refreshStorePilotFromNeon(storeRaw)
    : storeRaw;
  if (store !== storeRaw) {
    // Heal pilot only — do not rewrite the stale SSR snapshot over
    // concurrent feedback / Acted on this instance's JSON store.
    await persistHealedPilot(store, storeRaw);
  }
  const [needsReview, tenantSignals] = fetches.insightsQueue
    ? await Promise.all([
        fetchNeedsReview(storeRaw.tenant.id),
        fetchTenantSignals(storeRaw.tenant.id),
      ])
    : [skippedNeedsReview, skippedTenantSignals];
  const pendingRaw =
    fetches.insightsQueue && needsReview.ok
      ? pendingQueueSignals(
          needsReview.predictions,
          store.signals,
          tenantSignals.ok ? tenantSignals.rows : undefined
        )
      : store.signals.filter((s) => !s.feedback);
  const queueError =
    fetches.insightsQueue && !needsReview.ok ? needsReview.error : null;
  const reviewedRaw =
    fetches.insightsQueue && tenantSignals.ok
      ? reviewedQueueSignals(tenantSignals.rows, store.signals)
      : reviewedSignalsFromStore(store.signals);
  // Replace ingest: leftover Neon rows still have chats until prune. Do not
  // overlay those ids — JSON store is the keep-set for this landing.
  const reviewedForCadence = jsonKeepSet
    ? filterPendingWithChat(reviewedRaw, store.conversations)
    : reviewedRaw;
  const followUp = followUpSignals(reviewedForCadence);
  const overlayChats =
    fetches.insightsQueue && !jsonKeepSet
      ? await fetchOverlayConversations(
          store.tenant.id,
          missingConversationIds(
            [...pendingRaw, ...reviewedForCadence],
            store.conversations
          )
        )
      : null;
  if (fetches.insightsQueue) {
    // Fill Neon-stub evidence from overlay chats BEFORE drafting so
    // retention emails lock in quotes (not empty "No local evidence").
    const chats = mergeOverlayChats(
      store.conversations,
      store.messages,
      jsonKeepSet ? null : overlayChats,
    );
    const ensureCandidates = applyChatEvidenceToSignals(
      [...pendingRaw, ...reviewedForCadence],
      chats,
      store.taxonomyOverrides,
    );
    const { changed } = ensureSupervisedActions(
      store,
      ensureCandidates,
      chats.conversations,
    );
    if (changed) {
      await writeStore(store);
    }
  }
  const keepSetIds = keepSetConversationIds(
    store.conversations,
    overlayChats?.conversations,
    store.signals.map((signal) => signal.conversationId)
  );
  const scoreKeepSet = signalScoreConversationIds({
    keepSetIds,
    jsonKeepSet,
    jsonConversationCount: store.conversations.length,
  });
  const [backendScore, allTimeScore] = await Promise.all([
    fetches.windowedScore
      ? fetchSignalScoreSafe(store.tenant.id, scoreKeepSet, {
          dateFrom: scoreDateFrom,
        })
      : Promise.resolve(null),
    fetches.allTimeScore
      ? fetchSignalScoreSafe(store.tenant.id, scoreKeepSet)
      : Promise.resolve(null),
  ]);
  const hasSyncFailure = shouldShowSyncFailureBanner(syncFailed, store.signals);
  const cadencePreviewId = firstUnactedCorrectId(followUp);
  const cadenceAction = nextPilotCadenceAction(
    computePilotCadenceSteps({
      hasDay1: store.conversations.length > 0,
      hasMidWeekUpload: hasMidWeekExport(store.pilot?.weeklyExportCount),
      reviewedCount:
        backendScore?.reviewed_count ??
        store.signals.filter((s) => s.feedback).length,
      hasBaseline: hasPilotBaseline(
        store.pilot?.baselineOpportunities ?? 0,
        store.pilot?.baselineNote
      ),
    }),
    { unactedCorrectCount: followUp.length }
  );
  const pendingCount = filterPendingWithChat(pendingRaw, [
    ...store.conversations,
    ...(overlayChats?.conversations ?? []),
  ]).length;
  const scoreFromQuery =
    scoreWindow.status === "custom" ? scoreWindow.dateInput : null;
  // Bare Insights (no ?file=) defaults to Sample so app start shows Groww_batch_02.
  const vaultFile =
    view === "insights"
      ? resolveInsightsVaultFile(sp.file)
      : parseVaultFile(sp.file);
  const keepSetFileName = store.pilot?.lastUploadedFileName;
  const headerBatchName = resolveHeaderBatchName({
    vaultFile,
    lastUploadedFileName: keepSetFileName,
  });
  const batchRenderable = isVaultBatchRenderable(vaultFile, keepSetFileName);
  const notifications = buildHeaderNotifications({
    pendingCount,
    queueError,
    syncFailed: hasSyncFailure ? syncFailed : 0,
    syncCreated: hasSyncFailure ? syncCreated : 0,
    scoreUnavailable: fetches.windowedScore && backendScore == null,
    demoReady: sp.demo === "1" && batchRenderable,
    wipeFailed,
  });

  const title = TITLES[view];
  const importedCount = sp.imported ? Number(sp.imported) : null;
  const newSignalCount = sp.signals ? Number(sp.signals) : null;
  // Insights landing: omitted status → Shadow All / Action Follow-up.
  // Explicit status (Filters / deep links) always wins. Pending is never implicit.
  const statusFilter = resolveInsightsStatusFilter({
    raw: sp.status,
    mode: workspaceMode,
  });
  const statusOmitted =
    typeof sp.status !== "string" || sp.status === "";
  const typeFilter = parseTypeFilter(sp.type);
  const actionFilter = parseActionFilter(sp.action);
  const page = parsePage(sp.page);

  // Load only the active view module so Eval's day-picker stays off Insights/Upload.
  let viewNode: ReactNode = null;
  if (view === "insights") {
    const { InsightsView } = await import("@/components/views/InsightsView");
    viewNode = (
      <InsightsView
        store={store}
        demo={sp.demo === "1"}
        importedCount={importedCount}
        newSignalCount={newSignalCount}
        jsonKeepSet={jsonKeepSet}
        statusFilter={statusFilter}
        statusOmitted={statusOmitted}
        typeFilter={typeFilter}
        actionFilter={actionFilter}
        page={page}
        previewId={previewId}
        backendScore={backendScore}
        needsReview={needsReview}
        tenantSignals={tenantSignals}
        overlayChats={overlayChats}
        scoreFrom={scoreFromQuery}
        syncFailed={syncFailed}
        syncCreated={syncCreated}
        llmAdded={parseLlmAddedParam(sp.llmAdded)}
        llmFailed={parseLlmFailedParam(sp.llmFailed)}
        cadenceAction={cadenceAction}
        cadencePreviewId={cadencePreviewId}
        workspaceMode={workspaceMode}
        vaultFile={vaultFile}
        precomputedPending={pendingRaw}
        precomputedReviewed={reviewedRaw}
      />
    );
  } else if (view === "upload") {
    const { UploadView } = await import("@/components/views/UploadView");
    viewNode = (
      <UploadView
        hasPartnerExport={hasMidWeekExport(store.pilot?.weeklyExportCount)}
        lastUploadedFileName={store.pilot?.lastUploadedFileName}
        cadenceAction={cadenceAction}
        cadencePreviewId={cadencePreviewId}
      />
    );
  } else if (view === "eval") {
    const { EvalView } = await import("@/components/views/EvalView");
    viewNode = (
      <EvalView
        store={store}
        panelRaw={sp.panel}
        labeledRaw={sp.labeled}
        convPageRaw={sp.convPage}
        adaptPageRaw={sp.adaptPage}
        backendScore={backendScore}
        allTimeScore={allTimeScore}
        scoreWindow={scoreWindow}
        cadenceAction={cadenceAction}
        cadencePreviewId={cadencePreviewId}
      />
    );
  } else if (view === "taxonomy") {
    const { TaxonomyView } = await import("@/components/views/TaxonomyView");
    viewNode = <TaxonomyView typePageRaw={sp.taxPage} />;
  }

  return (
    <AppShell
      activeView={view}
      workspaceMode={workspaceMode}
      title={title}
      lastUploadedFileName={keepSetFileName}
      headerBatchName={headerBatchName}
      vaultFile={vaultFile}
      notifications={notifications}
    >
      {viewNode}
    </AppShell>
  );
}
