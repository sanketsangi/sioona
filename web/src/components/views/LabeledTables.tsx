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
      <div
        className="segmented shrink-0"
        role="group"
        aria-label="Labeled tables"
      >
        <Link
          href={tabHref("byType")}
          scroll={false}
          aria-current={table === "byType" ? "page" : undefined}
          className={`segmented-item ${table === "byType" ? "segmented-item-active" : ""}`}
        >
          By Type
        </Link>
        <Link
          href={tabHref("conversations")}
          scroll={false}
          aria-current={table === "conversations" ? "page" : undefined}
          className={`segmented-item ${table === "conversations" ? "segmented-item-active" : ""}`}
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

          {/* Mobile cards */}
          <ul className="mobile-card-stack min-h-0 flex-1 overflow-y-auto">
            {metrics.byType.map((row) => (
              <li key={row.type} className="mobile-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label-14 font-medium text-ds-gray-1000">
                    {signalTypeLabel(row.type)}
                  </span>
                  <span className="tabular text-label-13 text-ds-gray-900">
                    {row.labeledCount} labeled
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="metric-label">Precision</div>
                    <div className="tabular text-heading-16 text-ds-gray-1000">
                      {formatPercent(row.precision)}
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Recall</div>
                    <div className="tabular text-heading-16 text-ds-gray-1000">
                      {formatPercent(row.recall)}
                    </div>
                  </div>
                </div>
                <p className="tabular text-label-13 text-ds-gray-900">
                  TP&nbsp;{row.truePositives} · FP&nbsp;{row.falsePositives} ·
                  FN&nbsp;{row.falseNegatives}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="table-scroll hidden md:block">
            <table className="data-table">
              <thead className="border-b border-ds-gray-400">
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Labeled</th>
                  <th scope="col">Precision</th>
                  <th scope="col">Recall</th>
                  <th scope="col">TP / FP / FN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-gray-400">
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
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
              <p className="text-copy-14 text-ds-gray-1000">
                No conversations yet
              </p>
              <p className="mt-1 text-label-13 text-ds-gray-900">
                Upload a chat export or start the partner demo to populate this
                table.
              </p>
              <p className="mt-3">
                <Link href={viewHref("upload")} className="link-accent">
                  Upload Chats
                </Link>
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="mobile-card-stack min-h-0 flex-1 overflow-y-auto">
                {pageConvs.map((conversation) => {
                  const preds = store.signals.filter(
                    (s) => s.conversationId === conversation.id
                  );
                  const feedback = preds
                    .map((p) => p.feedback?.label)
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <li key={conversation.id} className="mobile-card">
                      <div className="min-w-0">
                        <p className="truncate text-label-14 font-medium text-ds-gray-1000">
                          {conversation.customerName ?? conversation.id}
                        </p>
                        <p className="mt-0.5 text-label-13 text-ds-gray-900">
                          Ground truth · {conversation.groundTruth ?? "—"}
                        </p>
                      </div>
                      <p className="break-words font-mono text-label-13 text-ds-gray-900">
                        {preds.length
                          ? preds
                              .map(
                                (p) =>
                                  `${signalTypeLabel(p.type)} (${Math.round(p.score * 100)})`
                              )
                              .join(", ")
                          : "None predicted"}
                      </p>
                      <p className="text-label-13 text-ds-gray-900">
                        Feedback · {feedback || "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table */}
              <div className="table-scroll hidden md:block">
                <table className="data-table table-fixed">
                  <thead className="border-b border-ds-gray-400">
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
                  <tbody className="divide-y divide-ds-gray-400">
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
            </>
          )}
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
        </section>
      )}
    </div>
  );
}
