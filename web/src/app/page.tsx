import type { Metadata } from "next";
import type { ReactNode } from "react";
import { after } from "next/server";
import { cookies } from "next/headers";
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
import { adoptNeonKeepSetWhenLocalMisses } from "@/lib/adopt-neon-keep-set";
import {
  fetchOverlayConversations,
  mergeOverlayChats,
} from "@/lib/hydrate-conversations";
import {
  bundledShowcaseConversationIds,
  omitBundledShowcaseChats,
  persistOmittedBundledShowcase,
} from "@/lib/showcase-keep-set";
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
  shouldOverlayKeepSetChats,
} from "@/lib/join-needs-review";
import { buildHeaderNotifications } from "@/lib/notifications";
import {
  parseLlmAddedParam,
  parseLlmFailedParam,
  parseLlmFailureParam,
} from "@/lib/detect-llm-query";
import {
  parseSyncCreatedParam,
  parseSyncFailedParam,
  shouldShowSyncFailureBanner,
  syncFailureBannerCounts,
} from "@/lib/prediction-sync";
import {
  computePilotCadenceSteps,
  firstUnactedCorrectId,
  hasMidWeekExport,
  hasPilotBaseline,
  nextPilotCadenceAction,
} from "@/lib/pilot-cadence";
import { normalizeSignalScoreCounts } from "@/lib/eval";
import { inspectSignalScoreWindow } from "@/lib/signal-score-window";
import { accountSurface } from "@/lib/account-surface";
import { authEnforced, publicDemoEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { loadStore, persistMissingSupervisedDrafts } from "@/lib/store";
import { DEMO_TENANT_ID, enterStoreTenant } from "@/lib/tenant-context";
import { overlaySupervisedActionsFromNeon } from "@/lib/supervised-action-persistence";
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
  isLivePartnerKeepSet,
  isVaultBatchRenderable,
  listUploadedChatFiles,
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
  report: "Revenue Leak",
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
    llmFailure?: string;
    preview?: string;
    scoreFrom?: string;
    wipeFailed?: string;
    mode?: string;
    replaced?: string;
    file?: string;
    reveal?: string;
  }>;
}) {
  const sp = await searchParams;
  let session: Awaited<ReturnType<typeof verifySessionToken>> = null;
  try {
    const cookieStore = await cookies();
    session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  } catch {
    session = null;
  }
  if (authEnforced() && !session && !publicDemoEnabled()) {
    redirect("/login");
  }
  enterStoreTenant(session?.tenantId ?? DEMO_TENANT_ID);
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
  const urlSyncFailed = parseSyncFailedParam(sp.syncFailed);
  const urlSyncCreated = parseSyncCreatedParam(sp.syncCreated);
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
  const requestedVaultFile = parseVaultFile(sp.file);
  const loaded = await loadStore({
    syncPredictions: false,
    freshOnly: jsonKeepSet,
  });
  // Replace leaves the bundled showcase in JSON until this request. Drop it
  // before adopt/hydrate, or Groww rows paint beside the uploaded file.
  // Persist from a fresh read — the snapshot above is already stale if a
  // label landed while showcase ids were loading.
  const showcaseIds = await bundledShowcaseConversationIds();
  const withoutShowcase = omitBundledShowcaseChats(loaded.store, showcaseIds);
  let storeForAdopt = loaded.store;
  if (withoutShowcase !== loaded.store) {
    if (withoutShowcase.conversations.length > 0) {
      storeForAdopt =
        (await persistOmittedBundledShowcase(showcaseIds)) ?? withoutShowcase;
    } else {
      storeForAdopt = withoutShowcase;
    }
  }
  const storeAdopted = await adoptNeonKeepSetWhenLocalMisses(
    storeForAdopt,
    requestedVaultFile,
    { freshOnly: jsonKeepSet },
  );
  const storeRaw = storeAdopted;
  const coldStart = loaded.coldStart && storeAdopted === loaded.store;
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
  // JSON already holds the keep-set → ask Neon only for those chats, and
  // page needs-review past 100. Empty JSON is wipe recovery: leave the
  // lists unfiltered so overlay can still find the remaining chats.
  const queueKeepSet =
    store.conversations.length > 0
      ? {
          conversationIds: store.conversations
            .map((conversation) => conversation.id)
            .filter((id) => id.length > 0),
        }
      : undefined;
  const [needsReview, tenantSignals] = fetches.insightsQueue
    ? await Promise.all([
        fetchNeedsReview(storeRaw.tenant.id, queueKeepSet),
        fetchTenantSignals(storeRaw.tenant.id, queueKeepSet),
      ])
    : [skippedNeedsReview, skippedTenantSignals];
  const pendingRaw =
    fetches.insightsQueue && needsReview.ok
      ? pendingQueueSignals(
          needsReview.predictions,
          store.signals,
          tenantSignals.ok ? tenantSignals.rows : undefined,
        )
      : store.signals.filter((s) => !s.feedback);
  const queueError =
    fetches.insightsQueue && !needsReview.ok ? needsReview.error : null;
  const reviewedRaw =
    fetches.insightsQueue && tenantSignals.ok
      ? reviewedQueueSignals(tenantSignals.rows, store.signals)
      : reviewedSignalsFromStore(store.signals);
  // Active JSON keep-set → no cross-pack overlay. Overlay only when JSON is
  // empty (wipe recovery) and not on `replaced=1` (prune race).
  const useKeepSetOverlay =
    fetches.insightsQueue &&
    shouldOverlayKeepSetChats({
      jsonKeepSet,
      jsonConversationCount: store.conversations.length,
    });
  const overlayChats = useKeepSetOverlay
    ? await fetchOverlayConversations(
        store.tenant.id,
        missingConversationIds(
          [...pendingRaw, ...reviewedRaw],
          store.conversations,
        ),
      )
    : null;
  const keepSetChats = [
    ...store.conversations,
    ...(overlayChats?.conversations ?? []),
  ];
  // Drop Neon stubs from other corpora (pending + Follow-up / Done).
  const reviewedForCadence = filterPendingWithChat(reviewedRaw, keepSetChats);
  const followUp = followUpSignals(reviewedForCadence);
  if (fetches.insightsQueue) {
    // Fill Neon-stub evidence from overlay chats BEFORE drafting so
    // supervised drafts lock in quotes (not empty "No local evidence").
    const chats = mergeOverlayChats(
      store.conversations,
      store.messages,
      overlayChats,
    );
    const ensureCandidates = applyChatEvidenceToSignals(
      [...pendingRaw, ...reviewedForCadence],
      chats,
      store.taxonomyOverrides,
    );
    // Paint drafts on this response. Disk gets a missing draft only after
    // another read, so this snapshot cannot replace a Correct / Acted /
    // ground-truth save that landed during first paint.
    ensureSupervisedActions(store, ensureCandidates, chats.conversations);
    await persistMissingSupervisedDrafts(
      ensureCandidates,
      chats.conversations,
    );
  }
  const decisionConversationIds =
    view === "insights"
      ? [
          ...new Set(
            keepSetChats
              .map((conversation) => conversation.id)
              .filter((id) => id.length > 0),
          ),
        ]
      : [];
  const keepSetIds = keepSetConversationIds(
    store.conversations,
    overlayChats?.conversations,
    store.signals.map((signal) => signal.conversationId),
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
    overlaySupervisedActionsFromNeon(store, decisionConversationIds),
  ]);
  // Ingest sets ?syncFailed= on this navigation. A deferred after() failure
  // is on the JSON snapshot and uses that same banner on the next load.
  const { syncFailed, syncCreated } = syncFailureBannerCounts({
    urlFailed: urlSyncFailed,
    urlCreated: urlSyncCreated,
    persisted: store.predictionSyncFailure,
  });
  const hasSyncFailure = shouldShowSyncFailureBanner(syncFailed, store.signals);
  const cadencePreviewId = firstUnactedCorrectId(followUp);
  const cadenceAction = nextPilotCadenceAction(
    computePilotCadenceSteps({
      hasDay1: store.conversations.length > 0,
      hasMidWeekUpload: hasMidWeekExport(store.pilot?.weeklyExportCount),
      reviewedCount: backendScore
        ? normalizeSignalScoreCounts(backendScore).reviewedCount
        : store.signals.filter((s) => s.feedback).length,
      hasBaseline: hasPilotBaseline(
        store.pilot?.baselineOpportunities ?? 0,
        store.pilot?.baselineNote,
      ),
    }),
    { unactedCorrectCount: followUp.length },
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
      ? resolveInsightsVaultFile(sp.file, store.pilot?.lastUploadedFileName)
      : parseVaultFile(sp.file);
  const keepSetFileName = store.pilot?.lastUploadedFileName;
  const uploadedFileNames = listUploadedChatFiles(
    store.conversations,
    keepSetFileName,
  );
  const headerBatchName = resolveHeaderBatchName({
    vaultFile,
    lastUploadedFileName: keepSetFileName,
  });
  const batchRenderable = isVaultBatchRenderable(
    vaultFile,
    keepSetFileName,
    uploadedFileNames,
    store.conversations.length,
  );
  const importedCount = sp.imported ? Number(sp.imported) : null;
  const newSignalCount = sp.signals ? Number(sp.signals) : null;
  // The file is still opening on another instance. A needs-review miss
  // against the previous pack is not a broken queue.
  const importLanding =
    (importedCount ?? 0) > 0 &&
    !batchRenderable &&
    isLivePartnerKeepSet(vaultFile);
  const notifications = buildHeaderNotifications({
    pendingCount,
    queueError: importLanding ? null : queueError,
    suppressPendingReview: importLanding,
    syncFailed: hasSyncFailure ? syncFailed : 0,
    syncCreated: hasSyncFailure ? syncCreated : 0,
    scoreUnavailable: importLanding
      ? false
      : fetches.windowedScore && backendScore == null,
    demoReady: sp.demo === "1" && batchRenderable,
    wipeFailed,
    importedCount,
    newSignalCount,
    llmFailed: parseLlmFailedParam(sp.llmFailed),
    llmFailure: parseLlmFailureParam(sp.llmFailure),
    llmSkipped: store.llmSkippedConversationIds?.length ?? 0,
  });

  const title = TITLES[view];
  // Insights landing: omitted status → Shadow All / Action Follow-up.
  // Explicit status (Filters / deep links) always wins. Pending is never implicit.
  const statusFilter = resolveInsightsStatusFilter({
    raw: sp.status,
    mode: workspaceMode,
  });
  const statusOmitted = typeof sp.status !== "string" || sp.status === "";
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
        llmFailure={parseLlmFailureParam(sp.llmFailure)}
        cadenceAction={cadenceAction}
        cadencePreviewId={cadencePreviewId}
        workspaceMode={workspaceMode}
        vaultFile={vaultFile}
        uploadedFileNames={uploadedFileNames}
        precomputedPending={pendingRaw}
        precomputedReviewed={reviewedRaw}
        scoreUnavailable={fetches.windowedScore && backendScore == null}
      />
    );
  } else if (view === "upload") {
    const { UploadView } = await import("@/components/views/UploadView");
    viewNode = (
      <UploadView
        hasPartnerExport={hasMidWeekExport(store.pilot?.weeklyExportCount)}
        lastUploadedFileName={store.pilot?.lastUploadedFileName}
        chatCount={store.conversations.length}
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
        syncFailed={hasSyncFailure ? syncFailed : 0}
      />
    );
  } else if (view === "report") {
    const { RevenueLeakReportView } = await import(
      "@/components/views/RevenueLeakReportView"
    );
    viewNode = (
      <RevenueLeakReportView
        store={store}
        backendScore={backendScore}
        windowLabel={scoreWindow.label}
        anonymised={sp.reveal !== "1"}
      />
    );
  } else if (view === "taxonomy") {
    const { TaxonomyView } = await import("@/components/views/TaxonomyView");
    viewNode = (
      <TaxonomyView
        typePageRaw={sp.taxPage}
        taxonomyOverrides={store.taxonomyOverrides ?? {}}
      />
    );
  }

  return (
    <AppShell
      activeView={view}
      workspaceMode={workspaceMode}
      title={title}
      lastUploadedFileName={keepSetFileName}
      headerBatchName={headerBatchName}
      uploadedFileNames={uploadedFileNames}
      chatCount={store.conversations.length}
      vaultFile={vaultFile}
      notifications={notifications}
      account={accountSurface({
        session,
        authOn: authEnforced(),
        publicDemo: publicDemoEnabled(),
      })}
    >
      {viewNode}
    </AppShell>
  );
}
