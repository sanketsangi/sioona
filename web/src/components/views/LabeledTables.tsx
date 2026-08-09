import Link from "next/link";
import { Pager } from "@/components/Pager";
import { SignalBadge } from "@/components/SignalBadge";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import {
  parseLabeledTab,
  parsePage,
  viewHref,
  type LabeledTab,
} from "@/lib/views";
import type { computeEvalMetrics } from "@/lib/eval";
import type { StoreData } from "@/lib/types";

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 gap-0.5" role="group" aria-label="Labeled tables">
        <Link
          href={tabHref("byType")}
          scroll={false}
          aria-current={table === "byType" ? "page" : undefined}
          className={`nav-link inline-flex items-center ${table === "byType" ? "nav-link-active" : ""}`}
        >
          By Type
        </Link>
        <Link
          href={tabHref("conversations")}
          scroll={false}
          aria-current={table === "conversations" ? "page" : undefined}
          className={`nav-link inline-flex items-center ${table === "conversations" ? "nav-link-active" : ""}`}
        >
          Conversations
        </Link>
      </div>

      {table === "byType" ? (
        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-ds-gray-400 px-4 py-2.5">
            <h2 className="text-balance text-heading-16 text-ds-gray-1000">
              Precision By Signal Type
            </h2>
          </div>

          {/* Card list below md — table columns clip/truncate on narrow viewports */}
          <ul className="min-h-0 flex-1 divide-y divide-ds-gray-400 overflow-y-auto md:hidden">
            {metrics.byType.map((row) => (
              <li key={row.type} className="px-4 py-3">
                <SignalBadge type={row.type} />
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <dt className="text-label-12 text-ds-gray-900">Labeled</dt>
                    <dd className="tabular font-mono text-label-13 text-ds-gray-1000">
                      {row.labeledCount}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-label-12 text-ds-gray-900">
                      TP / FP / FN
                    </dt>
                    <dd className="tabular font-mono text-label-13 text-ds-gray-1000">
                      {row.truePositives} / {row.falsePositives} /{" "}
                      {row.falseNegatives}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-label-12 text-ds-gray-900">
                      Precision
                    </dt>
                    <dd className="tabular text-copy-14 text-ds-gray-1000">
                      {formatPercent(row.precision)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-label-12 text-ds-gray-900">Recall</dt>
                    <dd className="tabular text-copy-14 text-ds-gray-1000">
                      {formatPercent(row.recall)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Table at md+ — columns have room to breathe */}
          <table className="hidden w-full text-left text-copy-14 md:table">
            <thead className="border-b border-ds-gray-400">
              <tr>
                <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                  Type
                </th>
                <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                  Labeled
                </th>
                <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                  Precision
                </th>
                <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                  Recall
                </th>
                <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                  TP / FP / FN
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-gray-400">
              {metrics.byType.map((row) => (
                <tr key={row.type}>
                  <td className="px-4 py-2.5 text-ds-gray-1000">
                    {signalTypeLabel(row.type)}
                  </td>
                  <td className="tabular px-4 py-2.5 font-mono text-label-13 text-ds-gray-900">
                    {row.labeledCount}
                  </td>
                  <td className="tabular px-4 py-2.5 text-ds-gray-1000">
                    {formatPercent(row.precision)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-ds-gray-1000">
                    {formatPercent(row.recall)}
                  </td>
                  <td className="tabular px-4 py-2.5 font-mono text-label-13 text-ds-gray-900">
                    {row.truePositives} / {row.falsePositives} /{" "}
                    {row.falseNegatives}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          {pageConvs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-copy-14 text-ds-gray-1000">
                No conversations yet
              </p>
              <p className="mt-1 text-label-13 text-ds-gray-900">
                Upload a chat export or start the partner demo to populate
                this table.
              </p>
              <p className="mt-3">
                <Link href={viewHref("upload")} className="link-accent">
                  Upload Chats
                </Link>
              </p>
            </div>
          ) : (
            <>
              {/* Card list below md — table columns truncate on narrow viewports */}
              <ul className="min-h-0 flex-1 divide-y divide-ds-gray-400 overflow-y-auto md:hidden">
                {pageConvs.map((conversation) => {
                  const preds = store.signals.filter(
                    (s) => s.conversationId === conversation.id
                  );
                  return (
                    <li key={conversation.id} className="px-4 py-3">
                      <p className="truncate text-label-14 font-medium text-ds-gray-1000">
                        {conversation.customerName ?? conversation.id}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                        <div className="min-w-0">
                          <dt className="text-label-12 text-ds-gray-900">
                            Ground Truth
                          </dt>
                          <dd className="text-copy-14 text-ds-gray-1000">
                            {conversation.groundTruth ?? "—"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-label-12 text-ds-gray-900">
                            Feedback
                          </dt>
                          <dd className="break-words text-copy-14 text-ds-gray-1000">
                            {preds
                              .map((p) => p.feedback?.label)
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-label-12 text-ds-gray-900">
                            Predicted
                          </dt>
                          <dd className="break-words font-mono text-label-13 text-ds-gray-1000">
                            {preds.length
                              ? preds
                                  .map(
                                    (p) =>
                                      `${p.type} (${Math.round(p.score * 100)})`
                                  )
                                  .join(", ")
                              : "none"}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>

              {/* Table at md+ — columns have room to breathe */}
              <table className="hidden w-full table-fixed text-left text-copy-14 md:table">
                <thead className="border-b border-ds-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                      Conversation
                    </th>
                    <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                      Ground Truth
                    </th>
                    <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                      Predicted
                    </th>
                    <th className="px-4 py-2 text-label-12 font-medium text-ds-gray-900">
                      Feedback
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ds-gray-400">
                  {pageConvs.map((conversation) => {
                    const preds = store.signals.filter(
                      (s) => s.conversationId === conversation.id
                    );
                    return (
                      <tr key={conversation.id}>
                        <td className="min-w-0 truncate px-4 py-2.5 text-ds-gray-1000">
                          {conversation.customerName ?? conversation.id}
                        </td>
                        <td className="px-4 py-2.5 text-ds-gray-900">
                          {conversation.groundTruth ?? "—"}
                        </td>
                        <td className="min-w-0 truncate px-4 py-2.5 font-mono text-label-13 text-ds-gray-900">
                          {preds.length
                            ? preds
                                .map(
                                  (p) =>
                                    `${p.type} (${Math.round(p.score * 100)})`
                                )
                                .join(", ")
                            : "none"}
                        </td>
                        <td className="px-4 py-2.5 text-ds-gray-900">
                          {preds
                            .map((p) => p.feedback?.label)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          <div className="mt-auto border-t border-ds-gray-400 px-4 py-2">
            <Pager
              page={page}
              pageCount={pageCount}
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
        </section>
      )}
    </div>
  );
}
