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
import type { Conversation, StoreData } from "@/lib/types";

const CONV_PAGE_SIZE = 10;

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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden sm:gap-4">
      <div
        className="flex shrink-0 flex-wrap gap-0.5"
        role="group"
        aria-label="Labeled tables"
      >
        <Link
          href={tabHref("byType")}
          scroll={false}
          aria-current={table === "byType" ? "page" : undefined}
          className={`nav-link ${table === "byType" ? "nav-link-active" : ""}`}
        >
          By Type
        </Link>
        <Link
          href={tabHref("conversations")}
          scroll={false}
          aria-current={table === "conversations" ? "page" : undefined}
          className={`nav-link ${table === "conversations" ? "nav-link-active" : ""}`}
        >
          Conversations
        </Link>
      </div>

      {table === "byType" ? (
        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-sio-border-base px-4 py-3">
            <h2 className="text-balance text-heading-16 text-sio-fg-base">
              Precision By Signal Type
            </h2>
          </div>
          <div
            className="table-scroll scroll-region min-h-0 flex-1"
            tabIndex={0}
            role="region"
            aria-label="Precision by signal type, scrollable"
          >
            <table className="data-table">
              <caption className="sr-only">
                Labeled precision, recall, and confusion counts for each signal
                type.
              </caption>
              <thead className="border-b border-sio-border-base">
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Labeled</th>
                  <th scope="col">Precision</th>
                  <th scope="col">Recall</th>
                  <th scope="col">TP / FP / FN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sio-border-base">
                {metrics.byType.map((row) => (
                  <tr key={row.type}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-2.5 text-left text-copy-14 font-normal text-sio-fg-base"
                    >
                      {signalTypeLabel(row.type)}
                    </th>
                    <td className="tabular font-mono text-label-13 text-sio-fg-subtle">
                      {row.labeledCount}
                    </td>
                    <td className="tabular text-sio-fg-base">
                      {formatPercent(row.precision)}
                    </td>
                    <td className="tabular text-sio-fg-base">
                      {formatPercent(row.recall)}
                    </td>
                    <td className="tabular whitespace-nowrap font-mono text-label-13 text-sio-fg-subtle">
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
            <div className="scroll-region flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <p className="text-heading-16 text-sio-fg-base">
                No conversations yet
              </p>
              <p className="mt-1 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
                Upload a chat export or start the partner demo to populate this
                table.
              </p>
              <Link href={viewHref("upload")} className="btn-primary mt-4">
                Upload Chats
              </Link>
            </div>
          ) : (
            <>
              {/* Cards below md — four squeezed columns are unreadable on a phone */}
              <ul className="scroll-region min-h-0 flex-1 divide-y divide-sio-border-base md:hidden">
                {pageConvs.map((conversation) => (
                  <li key={conversation.id} className="px-4 py-3">
                    <p className="text-pretty text-copy-14 font-medium text-sio-fg-base">
                      {conversation.customerName ?? conversation.id}
                    </p>
                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-label-13">
                      <dt className="text-sio-fg-subtle">Ground truth</dt>
                      <dd className="min-w-0 break-words text-sio-fg-base">
                        {conversation.groundTruth ?? "—"}
                      </dd>
                      <dt className="text-sio-fg-subtle">Predicted</dt>
                      <dd className="min-w-0 break-words font-mono text-sio-fg-base">
                        {predictionText(conversation)}
                      </dd>
                      <dt className="text-sio-fg-subtle">Feedback</dt>
                      <dd className="min-w-0 break-words text-sio-fg-base">
                        {feedbackText(conversation)}
                      </dd>
                    </dl>
                  </li>
                ))}
              </ul>

              <div
                className="table-scroll scroll-region hidden min-h-0 flex-1 md:block"
                tabIndex={0}
                role="region"
                aria-label="Labeled conversations, scrollable"
              >
                <table className="data-table">
                  <caption className="sr-only">
                    Ground truth labels, predicted signals, and reviewer
                    feedback per conversation.
                  </caption>
                  <thead className="border-b border-sio-border-base">
                    <tr>
                      <th scope="col">Conversation</th>
                      <th scope="col">Ground Truth</th>
                      <th scope="col">Predicted</th>
                      <th scope="col">Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sio-border-base">
                    {pageConvs.map((conversation) => (
                      <tr key={conversation.id}>
                        <th
                          scope="row"
                          className="max-w-[16rem] truncate px-4 py-2.5 text-left text-copy-14 font-normal text-sio-fg-base"
                        >
                          {conversation.customerName ?? conversation.id}
                        </th>
                        <td className="whitespace-nowrap text-sio-fg-subtle">
                          {conversation.groundTruth ?? "—"}
                        </td>
                        <td className="font-mono text-label-13 text-sio-fg-subtle">
                          {predictionText(conversation)}
                        </td>
                        <td className="text-sio-fg-subtle">
                          {feedbackText(conversation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 border-t border-sio-border-base px-4 py-3">
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
        </section>
      )}
    </div>
  );
}
