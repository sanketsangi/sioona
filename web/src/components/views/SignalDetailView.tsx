import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { Pager } from "@/components/Pager";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalBadge } from "@/components/SignalBadge";
import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import type { BackendSignalScore } from "@/lib/backend-client";
import { formatEvidenceItem, formatScore } from "@/lib/format";
import { parsePage, viewHref } from "@/lib/views";
import type { Conversation, Message, Signal } from "@/lib/types";

const MSG_PAGE_SIZE = 3;

export function SignalDetailView({
  signal,
  conversation,
  messages,
  msgPageRaw,
  backendScore = null,
  isNeonStub = false,
}: {
  signal: Signal;
  conversation?: Conversation;
  messages: Message[];
  msgPageRaw?: string | null;
  backendScore?: BackendSignalScore | null;
  /** Neon needs-review row without a JSON conversation join. */
  isNeonStub?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(messages.length / MSG_PAGE_SIZE));
  const page = Math.min(parsePage(msgPageRaw), pageCount);
  const pageMessages = messages.slice(
    (page - 1) * MSG_PAGE_SIZE,
    page * MSG_PAGE_SIZE
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Link
        href={viewHref("insights")}
        className="link-accent inline-flex h-9 shrink-0 items-center gap-1.5"
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
        Back to Queue
      </Link>

      {isNeonStub ? (
        <div
          className="status-banner status-banner-warning shrink-0"
          role="status"
        >
          <p className="text-copy-14 text-ds-gray-1000">
            Prediction is in Neon, but this conversation is not in the local
            store — no evidence or chat transcript to show. Re-run Detection or
            re-upload so dual-write can join evidence.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={viewHref("upload")} className="btn-secondary">
              Upload Chats
            </Link>
            <ReDetectButton />
          </div>
        </div>
      ) : null}

      <SignalScoreSummary score={backendScore} compact />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="panel shrink-0 p-4 sm:p-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SignalBadge type={signal.type} />
              <span className="tabular text-label-13 text-ds-gray-900">
                Detection{" "}
                <span className="font-medium text-ds-gray-1000">
                  {formatScore(signal.score)}
                </span>
              </span>
              {conversation?.customerName ? (
                <span className="min-w-0 truncate text-label-13 text-ds-gray-900">
                  · {conversation.customerName} · {conversation.channel}
                </span>
              ) : isNeonStub ? (
                <span className="text-label-13 text-ds-gray-900">
                  · Neon prediction only
                </span>
              ) : null}
            </div>
            <p className="mt-3 line-clamp-4 text-pretty text-copy-14 text-ds-gray-1000">
              {signal.summary}
            </p>
            <div className="mt-4 border-t border-ds-gray-400 pt-3">
              <div className="text-label-12 text-ds-gray-900">
                Suggested Next Action
              </div>
              <p className="mt-1 line-clamp-3 text-pretty text-copy-14 text-ds-gray-1000">
                {isNeonStub || !signal.suggestedAction
                  ? "Unavailable — local detection join missing."
                  : signal.suggestedAction}
              </p>
              <p className="mt-1 text-label-12 text-ds-gray-900">
                Display-only — copy into your CRM or chat tool; Sioona does not
                send messages.
              </p>
            </div>
            <div className="mt-4 border-t border-ds-gray-400 pt-3">
              <div className="text-label-12 text-ds-gray-900">
                Why This Fired
              </div>
              {signal.evidence.length > 0 ? (
                <ul className="mt-1.5 space-y-2">
                  {signal.evidence.slice(0, 4).map((item) => {
                    const { kind, text } = formatEvidenceItem(item);
                    return (
                      <li key={item} className="min-w-0 text-copy-14">
                        {kind === "quote" ? (
                          <blockquote className="border-l-2 border-ds-gray-500 pl-3 text-pretty text-ds-gray-1000">
                            “{text}”
                          </blockquote>
                        ) : (
                          <span className="text-ds-gray-900">{text}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 text-copy-14 text-ds-gray-900">
                  No local evidence
                  {isNeonStub
                    ? " — this Neon stub has no joined JSON signal."
                    : "."}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <FeedbackControls signal={signal} />
          </div>

          {conversation ? (
            <div className="shrink-0">
              <GroundTruthControl
                conversationId={conversation.id}
                groundTruth={conversation.groundTruth}
              />
            </div>
          ) : null}
        </div>

        <div className="panel flex min-h-0 flex-col p-4 sm:p-5">
          <h2 className="text-balance shrink-0 text-heading-16 text-ds-gray-1000">
            Conversation
          </h2>
          {isNeonStub || messages.length === 0 ? (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
              <p className="text-copy-14 text-ds-gray-1000">
                {isNeonStub
                  ? "No local conversation"
                  : "No messages stored"}
              </p>
              <p className="mt-1 text-copy-14 text-ds-gray-900">
                {isNeonStub
                  ? "Do not invent a transcript. Re-upload or Re-run Detection to attach chats from the JSON store."
                  : "Re-upload the chat export or open another signal."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href={viewHref("upload")} className="btn-secondary">
                  Upload Chats
                </Link>
                <Link href={viewHref("insights")} className="btn-secondary">
                  Back to Queue
                </Link>
              </div>
            </div>
          ) : (
            <>
              <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {pageMessages.map((message) => (
                  <li
                    key={message.id}
                    className={`rounded-sm px-3 py-2.5 text-copy-14 ${
                      message.role === "customer"
                        ? "bg-ds-gray-100 text-ds-gray-1000"
                        : "bg-transparent text-ds-gray-900 ring-1 ring-inset ring-ds-gray-400"
                    }`}
                  >
                    <div className="mb-1 text-label-12 capitalize text-ds-gray-900">
                      {message.role}
                    </div>
                    <p className="line-clamp-3">{message.content}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 shrink-0">
                <Pager
                  page={page}
                  pageCount={pageCount}
                  label="Messages"
                  prevHref={
                    page > 1
                      ? viewHref("insights", {
                          signal: signal.id,
                          msgPage: page - 1 > 1 ? String(page - 1) : null,
                        })
                      : null
                  }
                  nextHref={
                    page < pageCount
                      ? viewHref("insights", {
                          signal: signal.id,
                          msgPage: String(page + 1),
                        })
                      : null
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
