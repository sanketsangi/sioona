import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EvalView } from "@/components/views/EvalView";
import { InsightsView } from "@/components/views/InsightsView";
import { TaxonomyView } from "@/components/views/TaxonomyView";
import { UploadView } from "@/components/views/UploadView";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchTenantSignals } from "@/lib/fetch-tenant-signals";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { fetchOverlayConversations } from "@/lib/hydrate-conversations";
import {
  filterPendingWithChat,
  followUpSignals,
  keepSetConversationIds,
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
import { readStore, writeStore } from "@/lib/store";
import { refreshStorePilotFromNeon } from "@/lib/sync-pilot";
import {
  isActionModeUnlocked,
  parseMode,
  parsePage,
  parseTypeFilter,
  parseView,
  resolveInsightsStatusFilter,
  resolveWorkspaceMode,
  type PlatformView,
} from "@/lib/views";

export const dynamic = "force-dynamic";

const TITLES: Record<PlatformView, string> = {
  insights: "Insights",
  upload: "Upload Chats",
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
  const storeRaw = await readStore();
  const syncFailed = parseSyncFailedParam(sp.syncFailed);
  const syncCreated = parseSyncCreatedParam(sp.syncCreated);
  const wipeFailed = sp.wipeFailed === "1";
  const scoreWindow = inspectSignalScoreWindow({
    scoreFrom: sp.scoreFrom,
    envFrom: process.env.SIGNAL_SCORE_FROM,
  });
  const scoreDateFrom = scoreWindow.resolvedFrom;

  const [store, needsReview, tenantSignals] = await Promise.all([
    refreshStorePilotFromNeon(storeRaw),
    fetchNeedsReview(storeRaw.tenant.id),
    fetchTenantSignals(storeRaw.tenant.id),
  ]);
  if (store !== storeRaw) {
    // Heal this instance's ephemeral JSON so lift/breadcrumb match Neon SoT.
    await writeStore(store);
  }
  const pendingRaw = needsReview.ok
    ? pendingQueueSignals(needsReview.predictions, store.signals)
    : store.signals.filter((s) => !s.feedback);
  const queueError = needsReview.ok ? null : needsReview.error;
  const reviewedForCadence = tenantSignals.ok
    ? reviewedQueueSignals(tenantSignals.rows, store.signals)
    : reviewedSignalsFromStore(store.signals);
  const followUp = followUpSignals(reviewedForCadence);
  const overlayChats = await fetchOverlayConversations(
    store.tenant.id,
    missingConversationIds(
      [...pendingRaw, ...reviewedForCadence],
      store.conversations
    )
  );
  const keepSetIds = keepSetConversationIds(
    store.conversations,
    overlayChats?.conversations
  );
  const [backendScore, allTimeScore] = await Promise.all([
    fetchSignalScoreSafe(store.tenant.id, keepSetIds, {
      dateFrom: scoreDateFrom,
    }),
    fetchSignalScoreSafe(store.tenant.id, keepSetIds),
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
  const notifications = buildHeaderNotifications({
    pendingCount,
    queueError,
    syncFailed: hasSyncFailure ? syncFailed : 0,
    syncCreated: hasSyncFailure ? syncCreated : 0,
    scoreUnavailable: backendScore == null,
    demoReady: sp.demo === "1",
    wipeFailed,
  });

  const title = TITLES[view];
  const importedCount = sp.imported ? Number(sp.imported) : null;
  const newSignalCount = sp.signals ? Number(sp.signals) : null;
  // Insights landing: omitted status → Pending when Follow-up empty + pending > 0;
  // else Shadow all / Action followup. Explicit status (Filters) always wins.
  const statusFilter = resolveInsightsStatusFilter({
    raw: sp.status,
    mode: workspaceMode,
    pendingCount,
    followUpCount: followUp.length,
  });
  const statusOmitted =
    typeof sp.status !== "string" || sp.status === "";
  const typeFilter = parseTypeFilter(sp.type);
  const page = parsePage(sp.page);

  return (
    <AppShell
      activeView={view}
      workspaceMode={workspaceMode}
      title={title}
      lastUploadedFileName={store.pilot?.lastUploadedFileName}
      notifications={notifications}
    >
      {view === "insights" ? (
        <InsightsView
          store={store}
          demo={sp.demo === "1"}
          importedCount={importedCount}
          newSignalCount={newSignalCount}
          statusFilter={statusFilter}
          statusOmitted={statusOmitted}
          typeFilter={typeFilter}
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
        />
      ) : null}
      {view === "upload" ? (
        <UploadView
          hasPartnerExport={hasMidWeekExport(store.pilot?.weeklyExportCount)}
          lastUploadedFileName={store.pilot?.lastUploadedFileName}
          cadenceAction={cadenceAction}
          cadencePreviewId={cadencePreviewId}
        />
      ) : null}
      {view === "eval" ? (
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
      ) : null}
      {view === "taxonomy" ? <TaxonomyView typePageRaw={sp.taxPage} /> : null}
    </AppShell>
  );
}
