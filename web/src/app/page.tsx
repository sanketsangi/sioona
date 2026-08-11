import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EvalView } from "@/components/views/EvalView";
import { InsightsView } from "@/components/views/InsightsView";
import { SignalDetailView } from "@/components/views/SignalDetailView";
import { TaxonomyView } from "@/components/views/TaxonomyView";
import { UploadView } from "@/components/views/UploadView";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { predictionToStubSignal } from "@/lib/join-needs-review";
import {
  neonPredictionIdFromStubSignalId,
  parseSyncCreatedParam,
  parseSyncFailedParam,
} from "@/lib/prediction-sync";
import { readStore } from "@/lib/store";
import {
  parsePage,
  parseStatusFilter,
  parseTypeFilter,
  parseView,
  viewHref,
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
  searchParams: Promise<{ view?: string; signal?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  if (sp.signal) {
    return { title: "Signal Detail" };
  }
  const view = parseView(sp.view);
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
    preview?: string;
  }>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const signalId = sp.signal ?? null;
  const previewId = sp.preview ?? null;
  const store = await readStore();

  if (signalId) {
    const signal = store.signals.find((s) => s.id === signalId);
    const queueReturn: Record<string, string | undefined | null> = {
      demo: sp.demo === "1" ? "1" : null,
      imported: sp.imported ?? null,
      signals: sp.signals ?? null,
      status: sp.status ?? null,
      type: sp.type ?? null,
      page: sp.page ?? null,
      syncFailed: sp.syncFailed ?? null,
      syncCreated: sp.syncCreated ?? null,
      preview: sp.preview ?? null,
    };
    if (signal) {
      const conversation = store.conversations.find(
        (c) => c.id === signal.conversationId,
      );
      const messages = store.messages
        .filter((m) => m.conversationId === signal.conversationId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return (
        <AppShell
          activeView="insights"
          detailOpen
          title="Signal Detail"
        >
          <SignalDetailView
            signal={signal}
            conversation={conversation}
            messages={messages}
            queueReturn={queueReturn}
          />
        </AppShell>
      );
    }

    const neonId = neonPredictionIdFromStubSignalId(signalId);
    if (neonId) {
      const needsReview = await fetchNeedsReview(store.tenant.id, 100);
      const prediction = needsReview.ok
        ? needsReview.predictions.find((p) => p.id === neonId)
        : undefined;
      const stub = prediction
        ? predictionToStubSignal(prediction)
        : {
            ...predictionToStubSignal({
              id: neonId,
              tenant_id: store.tenant.id,
              conversation_id: "",
              signal_type: "lead",
              confidence: 0,
              summary: "Neon prediction (details unavailable)",
              created_at: new Date().toISOString(),
            }),
            id: signalId,
          };

      return (
        <AppShell
          activeView="insights"
          detailOpen
          title="Signal Detail"
        >
          <SignalDetailView
            signal={stub}
            messages={[]}
            isNeonStub
            queueReturn={queueReturn}
          />
        </AppShell>
      );
    }

    return (
      <AppShell
        activeView="insights"
        detailOpen
        title="Signal Not Found"
      >
        <div className="panel max-w-lg p-5">
          <p className="text-copy-14 text-ds-gray-900">
            No signal matches{" "}
            <code
              className="font-mono text-label-13 text-ds-gray-1000"
              translate="no"
            >
              {signalId}
            </code>
            .
          </p>
          <p className="mt-4">
            <Link
              href={viewHref("insights", queueReturn)}
              className="link-accent"
            >
              Back to Signal Queue
            </Link>
          </p>
        </div>
      </AppShell>
    );
  }

  const title = TITLES[view];
  const importedCount = sp.imported ? Number(sp.imported) : null;
  const newSignalCount = sp.signals ? Number(sp.signals) : null;
  const syncFailed = parseSyncFailedParam(sp.syncFailed);
  const syncCreated = parseSyncCreatedParam(sp.syncCreated);
  // Insights default: Neon pending (needs-review) list
  const statusFilter = parseStatusFilter(sp.status ?? "new");
  const typeFilter = parseTypeFilter(sp.type);
  const page = parsePage(sp.page);
  const backendScore =
    view === "insights" || view === "eval"
      ? await fetchSignalScoreSafe(store.tenant.id)
      : null;
  const needsReview =
    view === "insights" ? await fetchNeedsReview(store.tenant.id, 20) : null;

  return (
    <AppShell activeView={view} title={title}>
      {view === "insights" && needsReview ? (
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
          syncFailed={syncFailed}
          syncCreated={syncCreated}
        />
      ) : null}
      {view === "upload" ? <UploadView /> : null}
      {view === "eval" ? (
        <EvalView
          store={store}
          panelRaw={sp.panel}
          labeledRaw={sp.labeled}
          convPageRaw={sp.convPage}
          adaptPageRaw={sp.adaptPage}
          backendScore={backendScore}
        />
      ) : null}
      {view === "taxonomy" ? <TaxonomyView typePageRaw={sp.taxPage} /> : null}
    </AppShell>
  );
}
