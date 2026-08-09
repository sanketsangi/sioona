import Link from "next/link";
import { Pager } from "@/components/Pager";
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
      <div className="tab-bar" role="group" aria-label="Labeled tables">
        <Link
          href={tabHref("byType")}
          scroll={false}
          aria-current={table === "byType" ? "page" : undefined}
          className={`tab-link ${table === "byType" ? "nav-link-active" : ""}`}
        >
          By Type
        </Link>
        <Link
          href={tabHref("conversations")}
          scroll={false}
          aria-current={table === "conversations" ? "page" : undefined}
          className={`tab-link ${table === "conversations" ? "nav-link-active" : ""}`}
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

          <ul className="data-cards">
            {metrics.byType.map((row) => (
              <li key={row.type} className="data-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label-14 font-medium text-ds-gray-1000">
                    {signalTypeLabel(row.type)}
                  </span>
                  <span className="tabular text-label-13 text-ds-gray-900">
                    {row.labeledCount} labeled
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="data-card-field">
                    <span className="data-card-label">Precision</span>
                    <span className="tabular data-card-value">
                      {formatPercent(row.precision)}
                    </span>
                  </div>
                  <div className="data-card-field">
                    <span className="data-card-label">Recall</span>
                    <span className="tabular data-card-value">
                      {formatPercent(row.recall)}
                    </span>
                  </div>
                  <div className="data-card-field col-span-2">
                    <span className="data-card-label">TP / FP / FN</span>
                    <span className="tabular font-mono text-label-13 text-ds-gray-900">
                      {row.truePositives} / {row.falsePositives} /{" "}
                      {row.falseNegatives}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="table-scroll hidden md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Labeled</th>
                  <th scope="col">Precision</th>
                  <th scope="col">Recall</th>
                  <th scope="col">TP / FP / FN</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byType.map((row) => (
                  <tr key={row.type}>
                    <td className="text-ds-gray-1000">
                      {signalTypeLabel(row.type)}
                    </td>
                    <td className="tabular font-mono text-label-13 text-ds-gray-900">
                      {row.labeledCount}
                    </td>
                    <td className="tabular text-ds-gray-1000">
                      {formatPercent(row.precision)}
                    </td>
                    <td className="tabular text-ds-gray-1000">
                      {formatPercent(row.recall)}
                    </td>
                    <td className="tabular font-mono text-label-13 text-ds-gray-900">
                      {row.truePositives} / {row.falsePositives} /{" "}
                      {row.falseNegatives}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          {pageConvs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <p className="text-copy-14 text-ds-gray-1000">No conversations yet</p>
              <p className="mt-1 text-label-13 text-ds-gray-900">
                Upload a chat export or start the partner demo to populate this
                table.
              </p>
              <Link href={viewHref("upload")} className="btn-primary mt-4">
                Upload Chats
              </Link>
            </div>
          ) : (
            <>
              <ul className="data-cards">
                {pageConvs.map((conversation) => {
                  const preds = store.signals.filter(
                    (s) => s.conversationId === conversation.id
                  );
                  const predicted = preds.length
                    ? preds
                        .map(
                          (p) => `${p.type} (${Math.round(p.score * 100)})`
                        )
                        .join(", ")
                    : "none";
                  const feedback =
                    preds
                      .map((p) => p.feedback?.label)
                      .filter(Boolean)
                      .join(", ") || "—";

                  return (
                    <li key={conversation.id} className="data-card">
                      <div className="data-card-field">
                        <span className="data-card-label">Conversation</span>
                        <span className="data-card-value truncate">
                          {conversation.customerName ?? conversation.id}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="data-card-field">
                          <span className="data-card-label">Ground Truth</span>
                          <span className="data-card-value">
                            {conversation.groundTruth ?? "—"}
                          </span>
                        </div>
                        <div className="data-card-field">
                          <span className="data-card-label">Feedback</span>
                          <span className="data-card-value">{feedback}</span>
                        </div>
                        <div className="data-card-field col-span-2">
                          <span className="data-card-label">Predicted</span>
                          <span className="min-w-0 break-words font-mono text-label-13 text-ds-gray-900">
                            {predicted}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="table-scroll hidden md:block">
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th scope="col" className="w-[28%]">
                        Conversation
                      </th>
                      <th scope="col" className="w-[18%]">
                        Ground Truth
                      </th>
                      <th scope="col" className="w-[34%]">
                        Predicted
                      </th>
                      <th scope="col" className="w-[20%]">
                        Feedback
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageConvs.map((conversation) => {
                      const preds = store.signals.filter(
                        (s) => s.conversationId === conversation.id
                      );
                      return (
                        <tr key={conversation.id}>
                          <td className="min-w-0 truncate text-ds-gray-1000">
                            {conversation.customerName ?? conversation.id}
                          </td>
                          <td className="text-ds-gray-900">
                            {conversation.groundTruth ?? "—"}
                          </td>
                          <td className="min-w-0 truncate font-mono text-label-13 text-ds-gray-900">
                            {preds.length
                              ? preds
                                  .map(
                                    (p) =>
                                      `${p.type} (${Math.round(p.score * 100)})`
                                  )
                                  .join(", ")
                              : "none"}
                          </td>
                          <td className="text-ds-gray-900">
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
              </div>

              <div className="mt-auto shrink-0 border-t border-ds-gray-400 px-4 py-2">
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
            </>
          )}
        </section>
      )}
    </div>
  );
}
