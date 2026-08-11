import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
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

const MSG_PAGE_SIZE = 12;

export function SignalDetailView({
  signal,
  conversation,
  messages,
  msgPageRaw,
  backendScore = null,
  isNeonStub = false,
  /** Preserve Insights filters / banners when returning to the queue. */
  queueReturn,
}: {
  signal: Signal;
  conversation?: Conversation;
  messages: Message[];
  msgPageRaw?: string | null;
  backendScore?: BackendSignalScore | null;
  /** Neon needs-review row without a JSON conversation join. */
  isNeonStub?: boolean;
  queueReturn?: Record<string, string | undefined | null>;
}) {
  const pageCount = Math.max(1, Math.ceil(messages.length / MSG_PAGE_SIZE));
  const page = Math.min(parsePage(msgPageRaw), pageCount);
  const pageMessages = messages.slice(
    (page - 1) * MSG_PAGE_SIZE,
    page * MSG_PAGE_SIZE
  );
  const backHref = viewHref("insights", queueReturn);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden sm:gap-4">
      <Link
        href={backHref}
        className="link-accent inline-flex h-11 shrink-0 items-center gap-1.5 md:h-9"
      >
        <ArrowLeft className="size-3.5" weight="regular" aria-hidden />
        Back to Queue
      </Link>

      {isNeonStub ? (
        <div
          className="status-banner status-banner-warning shrink-0"
          role="status"
        >
          <p className="text-copy-14 text-sio-fg-base">
            Prediction is in Neon, but this conversation is not in the local
            store — no evidence or chat transcript to show. Re-run Detection or
            re-upload so dual-write can join evidence.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link href={viewHref("upload")} className="btn-secondary">
              Upload Chats
            </Link>
            <ReDetectButton />
          </div>
        </div>
      ) : null}

      <div className="shrink-0">
        <SignalScoreSummary score={backendScore} compact />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-rows-1 lg:gap-4">
        <div className="scroll-region flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
          <div className="panel shrink-0 p-3.5 sm:p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SignalBadge type={signal.type} />
              <span className="tabular text-label-13 text-sio-fg-muted">
                Detection{" "}
                <span className="font-medium text-sio-fg-base">
                  {formatScore(signal.score)}
                </span>
              </span>
              {conversation?.customerName ? (
                <span className="min-w-0 truncate text-label-13 text-sio-fg-muted">
                  · {conversation.customerName} · {conversation.channel}
                </span>
              ) : isNeonStub ? (
                <span className="text-label-13 text-sio-fg-muted">
                  · Neon prediction only
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 line-clamp-4 break-words text-pretty text-copy-14 font-medium text-sio-fg-base">
              {signal.summary}
            </p>
            <div className="mt-3.5 border-t border-sio-border-base pt-3">
              <div className="eyebrow">Suggested Next Action</div>
              <p className="mt-1.5 line-clamp-3 break-words text-pretty text-copy-14 text-sio-fg-base">
                {isNeonStub || !signal.suggestedAction
                  ? "Unavailable — local detection join missing."
                  : signal.suggestedAction}
              </p>
              <p className="mt-1 text-label-12 text-sio-fg-muted">
                Display-only — copy into your CRM or chat tool; Sioona does not
                send messages.
              </p>
            </div>
            <div className="mt-3.5 border-t border-sio-border-base pt-3">
              <div className="eyebrow">Why This Fired</div>
              {signal.evidence.length > 0 ? (
                <ul className="mt-1.5 space-y-2">
                  {signal.evidence.slice(0, 4).map((item) => {
                    const { kind, text } = formatEvidenceItem(item);
                    return (
                      <li key={item} className="min-w-0 text-copy-14">
                        {kind === "quote" ? (
                          <blockquote className="break-words border-l-2 border-sio-border-base pl-3 text-pretty text-sio-fg-base">
                            “{text}”
                          </blockquote>
                        ) : (
                          <span className="break-words text-sio-fg-muted">
                            {text}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 text-copy-14 text-sio-fg-muted">
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
            <div className="shrink-0 pb-1">
              <GroundTruthControl
                conversationId={conversation.id}
                groundTruth={conversation.groundTruth}
              />
            </div>
          ) : null}
        </div>

        <div className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3.5 sm:p-4">
          <h2 className="text-balance shrink-0 text-heading-16 text-sio-fg-base">
            Conversation
          </h2>
          {isNeonStub || messages.length === 0 ? (
            <div className="scroll-region mt-3 flex flex-1 flex-col items-center justify-center text-center">
              <p className="text-copy-14 text-sio-fg-base">
                {isNeonStub
                  ? "No local conversation"
                  : "No messages stored"}
              </p>
              <p className="mt-1 text-label-13 text-sio-fg-muted">
                {isNeonStub
                  ? "Do not invent a transcript. Re-upload or Re-run Detection to attach chats from the JSON store."
                  : "Re-upload the chat export or open another signal."}
              </p>
              <div className="mt-3.5 flex flex-wrap justify-center gap-2">
                <Link href={viewHref("upload")} className="btn-secondary">
                  Upload Chats
                </Link>
                <Link href={backHref} className="btn-secondary">
                  Back to Queue
                </Link>
              </div>
            </div>
          ) : (
            <>
              <ul className="scroll-region mt-3 min-h-0 flex-1 space-y-1.5">
                {pageMessages.map((message) => (
                  <li
                    key={message.id}
                    className={`rounded-sm px-2.5 py-2 text-copy-14 ${
                      message.role === "customer"
                        ? "bg-sio-bg-muted text-sio-fg-base"
                        : "bg-transparent text-sio-fg-subtle ring-1 ring-inset ring-sio-border-base"
                    }`}
                  >
                    <div className="mb-0.5 text-label-12 capitalize text-sio-fg-muted">
                      {message.role}
                    </div>
                    <p className="break-words text-pretty">{message.content}</p>
                  </li>
                ))}
              </ul>
              {pageCount > 1 ? (
                <div className="mt-auto shrink-0 border-t border-sio-border-base pt-3">
                  <Pager
                    page={page}
                    pageCount={pageCount}
                    label="Messages"
                    prevHref={
                      page > 1
                        ? viewHref("insights", {
                            ...queueReturn,
                            signal: signal.id,
                            msgPage: page - 1 > 1 ? String(page - 1) : null,
                          })
                        : null
                    }
                    nextHref={
                      page < pageCount
                        ? viewHref("insights", {
                            ...queueReturn,
                            signal: signal.id,
                            msgPage: String(page + 1),
                          })
                        : null
                    }
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
