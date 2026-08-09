import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EvalView } from "@/components/views/EvalView";
import { InsightsView } from "@/components/views/InsightsView";
import { SignalDetailView } from "@/components/views/SignalDetailView";
import { TaxonomyView } from "@/components/views/TaxonomyView";
import { UploadView } from "@/components/views/UploadView";
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

const TITLES: Record<PlatformView, { title: string; subtitle: string }> = {
  insights: {
    title: "Signal Insights",
    subtitle:
      "Prioritized revenue signals. Review, then act manually — no autonomous actions.",
  },
  upload: {
    title: "Upload Chats",
    subtitle:
      "Drop a partner export to run detection. No live webhooks required.",
  },
  eval: {
    title: "Eval & SignalScore",
    subtitle:
      "Labeled precision, human review precision, and pilot go/no-go metrics.",
  },
  taxonomy: {
    title: "Signal Taxonomy",
    subtitle: "Lead, retention, and upsell — keywords, phrases, and examples.",
  },
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
  return { title: TITLES[view].title };
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
  }>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const signalId = sp.signal ?? null;
  const store = await readStore();

  if (signalId) {
    const signal = store.signals.find((s) => s.id === signalId);
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
          subtitle="Shadow Mode — suggested action is display-only."
        >
          <SignalDetailView
            signal={signal}
            conversation={conversation}
            messages={messages}
            msgPageRaw={sp.msgPage}
          />
        </AppShell>
      );
    }

    return (
      <AppShell
        activeView="insights"
        detailOpen
        title="Signal Not Found"
        subtitle="This signal may have been removed or the link is outdated."
      >
        <div className="panel max-w-lg p-5">
          <p className="text-copy-14 text-ds-gray-900">
            No signal matches{" "}
            <code className="font-mono text-label-13 text-ds-gray-1000" translate="no">
              {signalId}
            </code>
            .
          </p>
          <p className="mt-4">
            <Link href={viewHref("insights")} className="link-accent">
              Back to Signal Queue
            </Link>
          </p>
        </div>
      </AppShell>
    );
  }

  const meta = TITLES[view];
  const importedCount = sp.imported ? Number(sp.imported) : null;
  const newSignalCount = sp.signals ? Number(sp.signals) : null;
  const statusFilter = parseStatusFilter(
    sp.status ?? (sp.demo === "1" ? "new" : "all"),
  );
  const typeFilter = parseTypeFilter(sp.type);
  const page = parsePage(sp.page);

  return (
    <AppShell activeView={view} title={meta.title} subtitle={meta.subtitle}>
      {view === "insights" ? (
        <InsightsView
          store={store}
          demo={sp.demo === "1"}
          importedCount={importedCount}
          newSignalCount={newSignalCount}
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          page={page}
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
        />
      ) : null}
      {view === "taxonomy" ? <TaxonomyView typePageRaw={sp.taxPage} /> : null}
    </AppShell>
  );
}
