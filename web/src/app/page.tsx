import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EvalView } from "@/components/views/EvalView";
import { InsightsView } from "@/components/views/InsightsView";
import { TaxonomyView } from "@/components/views/TaxonomyView";
import { UploadView } from "@/components/views/UploadView";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { joinNeedsReviewPredictions } from "@/lib/join-needs-review";
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
import { hasMidWeekExport } from "@/lib/pilot-cadence";
import { inspectSignalScoreWindow } from "@/lib/signal-score-window";
import { readStore } from "@/lib/store";
import {
  parsePage,
  parseStatusFilter,
  parseTypeFilter,
  parseView,
  type PlatformView,
} from "@/lib/views";

export const dynamic = "force-dynamic";

const TITLES: Record<PlatformView, string> = {
  insights: "Signal Insights",
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
  }>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const signalId = sp.signal ?? null;

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
  const store = await readStore();
  const syncFailed = parseSyncFailedParam(sp.syncFailed);
  const syncCreated = parseSyncCreatedParam(sp.syncCreated);
  const keepSetIds = store.conversations.map((c) => c.id);
  const scoreWindow = inspectSignalScoreWindow({
    scoreFrom: sp.scoreFrom,
    envFrom: process.env.SIGNAL_SCORE_FROM,
  });
  const scoreDateFrom = scoreWindow.resolvedFrom;

  const [backendScore, allTimeScore, needsReview] = await Promise.all([
    fetchSignalScoreSafe(store.tenant.id, keepSetIds, {
      dateFrom: scoreDateFrom,
    }),
    fetchSignalScoreSafe(store.tenant.id, keepSetIds),
    fetchNeedsReview(store.tenant.id),
  ]);
  const pendingCount = needsReview.ok
    ? joinNeedsReviewPredictions(needsReview.predictions, store.signals).length
    : 0;
  const queueError = needsReview.ok ? null : needsReview.error;
  const hasSyncFailure = shouldShowSyncFailureBanner(syncFailed, store.signals);
  const notifications = buildHeaderNotifications({
    pendingCount,
    queueError,
    syncFailed: hasSyncFailure ? syncFailed : 0,
    syncCreated: hasSyncFailure ? syncCreated : 0,
    scoreUnavailable: backendScore == null,
    demoReady: sp.demo === "1",
  });

  const title = TITLES[view];
  const importedCount = sp.imported ? Number(sp.imported) : null;
  const newSignalCount = sp.signals ? Number(sp.signals) : null;
  // Insights default: Neon pending (needs-review) list
  const statusFilter = parseStatusFilter(sp.status ?? "new");
  const typeFilter = parseTypeFilter(sp.type);
  const page = parsePage(sp.page);

  return (
    <AppShell activeView={view} title={title} notifications={notifications}>
      {view === "insights" ? (
        <InsightsView
          store={store}
          demo={sp.demo === "1"}
          importedCount={importedCount}
          newSignalCount={newSignalCount}
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          page={page}
          previewId={previewId}
          backendScore={backendScore}
          needsReview={needsReview}
          scoreFrom={
            scoreWindow.status === "custom" ? scoreWindow.dateInput : null
          }
          syncFailed={syncFailed}
          syncCreated={syncCreated}
          llmAdded={parseLlmAddedParam(sp.llmAdded)}
          llmFailed={parseLlmFailedParam(sp.llmFailed)}
        />
      ) : null}
      {view === "upload" ? (
        <UploadView
          hasPartnerExport={hasMidWeekExport(store.pilot?.weeklyExportCount)}
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
        />
      ) : null}
      {view === "taxonomy" ? <TaxonomyView typePageRaw={sp.taxPage} /> : null}
    </AppShell>
  );
}
