import Link from "next/link";
import {
  EvalCard,
  EvalMetric,
  evalCardHeaderClassName,
} from "@/components/EvalCard";
import { EvalTabLink } from "@/components/EvalTabLink";
import { Pager } from "@/components/Pager";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPercent } from "@/lib/format";
import {
  parseLabeledTab,
  parsePage,
  viewHref,
  type LabeledTab,
} from "@/lib/views";
import type { computeEvalMetrics } from "@/lib/eval";
import type { Conversation, StoreData } from "@/lib/types";

/** Compact page size so the list fits the viewport without nested scroll. */
const CONV_PAGE_SIZE = 5;

export function LabeledTables({
  store,
  metrics,
  labeledRaw,
  convPageRaw,
}: {
  store: StoreData;
  metrics: ReturnType<typeof computeEvalMetrics>;
  labeledRaw?: string | null;
  convPageRaw?: string | null;
}) {
  const table = parseLabeledTab(labeledRaw);
  const pageCount = Math.max(
    1,
    Math.ceil(store.conversations.length / CONV_PAGE_SIZE)
  );
  const page = Math.min(parsePage(convPageRaw), pageCount);
  const pageConvs = store.conversations.slice(
    (page - 1) * CONV_PAGE_SIZE,
    page * CONV_PAGE_SIZE
  );

  function tabHref(next: LabeledTab) {
    return viewHref("eval", {
      panel: "labeled",
      labeled: next === "byType" ? null : next,
      convPage: null,
    });
  }

  function predictionText(conversation: Conversation): string {
    const preds = store.signals.filter(
      (s) => s.conversationId === conversation.id
    );
    if (preds.length === 0) return "none";
    return preds
      .map((p) => `${p.type} (${Math.round(p.score * 100)})`)
      .join(", ");
  }

  function feedbackText(conversation: Conversation): string {
    return (
      store.signals
        .filter((s) => s.conversationId === conversation.id)
        .map((p) => p.feedback?.label)
        .filter(Boolean)
        .join(", ") || "—"
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <EvalCard className="shrink-0">
        <div className={evalCardHeaderClassName}>
          <div className="min-w-0">
            <p className="eyebrow">Labeled pack</p>
            <p className="mt-1 text-pretty text-copy-14 text-sio-fg-subtle">
              Measures the labeled pack.
            </p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-3 divide-x divide-sio-border-base overflow-hidden">
          <EvalMetric
            label="P"
            value={formatPercent(metrics.labeledPrecision)}
            hint={`${metrics.truePositives} TP / ${metrics.falsePositives} FP`}
          />
          <EvalMetric
            label="R"
            value={formatPercent(metrics.labeledRecall)}
            hint={`${metrics.falseNegatives} FN`}
          />
          <EvalMetric
            label="Chats"
            value={String(metrics.labeledConversations)}
            hint={`${metrics.predictedSignals} pred.`}
          />
        </div>
      </EvalCard>

      <Tabs
        value={table}
        activationMode="manual"
        className="min-h-0 flex-1 gap-4"
      >
        <TabsList
          aria-label="Labeled tables"
          className="!h-9 w-fit max-w-full shrink-0 border border-border"
        >
          <TabsTrigger value="byType" asChild className="min-w-0 flex-none px-3">
            <EvalTabLink href={tabHref("byType")}>
              <span className="truncate">By Type</span>
            </EvalTabLink>
          </TabsTrigger>
          <TabsTrigger
            value="conversations"
            asChild
            className="min-w-0 flex-none px-3"
          >
            <EvalTabLink href={tabHref("conversations")}>
              <span className="truncate">Conversations</span>
            </EvalTabLink>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value={table}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
      {table === "byType" ? (
        <EvalCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-sio-border-base px-3 py-2.5 sm:px-4">
            <h2 className="text-balance text-heading-16 text-sio-fg-base">
              Precision By Signal Type
            </h2>
          </div>
          <div className="hide-scrollbar min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-0 text-left text-copy-14">
              <caption className="sr-only">
                Labeled precision, recall, and confusion counts for each signal
                type.
              </caption>
              <thead className="border-b border-sio-border-base">
                <tr>
                  <th
                    scope="col"
                    className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
                  >
                    Labeled
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
                  >
                    Precision
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
                  >
                    Recall
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:table-cell sm:px-4"
                  >
                    TP / FP / FN
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sio-border-base">
                {metrics.byType.map((row) => (
                  <tr key={row.type}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-3 py-2.5 text-left font-normal sm:px-4"
                    >
                      <SignalTypeChip type={row.type} />
                    </th>
                    <td className="tabular px-3 py-2.5 font-mono text-label-13 text-sio-fg-subtle sm:px-4">
                      {row.labeledCount}
                    </td>
                    <td className="tabular px-3 py-2.5 text-sio-fg-base sm:px-4">
                      {formatPercent(row.precision)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-sio-fg-base sm:px-4">
                      {formatPercent(row.recall)}
                    </td>
                    <td className="hidden tabular whitespace-nowrap px-3 py-2.5 font-mono text-label-13 text-sio-fg-subtle sm:table-cell sm:px-4">
                      {row.truePositives} / {row.falsePositives} /{" "}
                      {row.falseNegatives}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EvalCard>
      ) : (
        <EvalCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {pageConvs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
              <p className="text-heading-16 text-sio-fg-base">
                No conversations yet
              </p>
              <p className="mt-1 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
                Upload a chat export or start the partner demo to populate this
                table.
              </p>
              <Link href={viewHref("upload")} className="btn-primary mt-4">
                Uploaded Chats
              </Link>
            </div>
          ) : (
            <>
              <ul className="min-h-0 flex-1 divide-y divide-sio-border-base overflow-hidden md:hidden">
                {pageConvs.map((conversation) => (
                  <li key={conversation.id} className="px-3 py-2.5 sm:px-4">
                    <p className="truncate text-copy-14 font-medium text-sio-fg-base">
                      {conversation.customerName ?? conversation.id}
                    </p>
                    <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-label-13">
                      <dt className="text-sio-fg-muted">Ground truth</dt>
                      <dd className="min-w-0 truncate text-sio-fg-base">
                        {conversation.groundTruth ?? "—"}
                      </dd>
                      <dt className="text-sio-fg-muted">Predicted</dt>
                      <dd className="min-w-0 truncate font-mono text-sio-fg-base">
                        {predictionText(conversation)}
                      </dd>
                      <dt className="text-sio-fg-muted">Feedback</dt>
                      <dd className="min-w-0 truncate text-sio-fg-base">
                        {feedbackText(conversation)}
                      </dd>
                    </dl>
                  </li>
                ))}
              </ul>

              <div className="hide-scrollbar hidden min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:block">
                <table className="w-full min-w-0 text-left text-copy-14">
                  <caption className="sr-only">
                    Ground truth labels, predicted signals, and reviewer
                    feedback per conversation.
                  </caption>
                  <thead className="border-b border-sio-border-base">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle"
                      >
                        Conversation
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle"
                      >
                        Ground Truth
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle"
                      >
                        Predicted
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle"
                      >
                        Feedback
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sio-border-base">
                    {pageConvs.map((conversation) => (
                      <tr key={conversation.id}>
                        <th
                          scope="row"
                          className="max-w-[14rem] truncate px-4 py-2 text-left text-copy-14 font-normal text-sio-fg-base"
                        >
                          {conversation.customerName ?? conversation.id}
                        </th>
                        <td className="whitespace-nowrap px-4 py-2 text-sio-fg-subtle">
                          {conversation.groundTruth ?? "—"}
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-2 font-mono text-label-13 text-sio-fg-subtle">
                          {predictionText(conversation)}
                        </td>
                        <td className="max-w-[10rem] truncate px-4 py-2 text-sio-fg-subtle">
                          {feedbackText(conversation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-auto shrink-0 border-t border-sio-border-base px-3 py-2 sm:px-4">
                <Pager
                  page={page}
                  pageCount={pageCount}
                  label="Conversations"
                  prevHref={
                    page > 1
                      ? viewHref("eval", {
                          panel: "labeled",
                          labeled: "conversations",
                          convPage: page - 1 > 1 ? String(page - 1) : null,
                        })
                      : null
                  }
                  nextHref={
                    page < pageCount
                      ? viewHref("eval", {
                          panel: "labeled",
                          labeled: "conversations",
                          convPage: String(page + 1),
                        })
                      : null
                  }
                />
              </div>
            </>
          )}
        </EvalCard>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
