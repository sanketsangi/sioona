import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { Pager } from "@/components/Pager";
import { SignalBadge } from "@/components/SignalBadge";
import { formatEvidenceItem, formatScore } from "@/lib/format";
import { parsePage, viewHref } from "@/lib/views";
import type { Conversation, Message, Signal } from "@/lib/types";

const MSG_PAGE_SIZE = 12;

export function SignalDetailView({
  signal,
  conversation,
  messages,
  msgPageRaw,
}: {
  signal: Signal;
  conversation?: Conversation;
  messages: Message[];
  msgPageRaw?: string | null;
}) {
  const pageCount = Math.max(1, Math.ceil(messages.length / MSG_PAGE_SIZE));
  const page = Math.min(parsePage(msgPageRaw), pageCount);
  const pageMessages = messages.slice(
    (page - 1) * MSG_PAGE_SIZE,
    page * MSG_PAGE_SIZE
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Link
        href={viewHref("insights")}
        className="link-accent inline-flex h-11 w-fit items-center gap-1.5 md:h-9"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
        Back to Queue
      </Link>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
        <div className="flex flex-col gap-4 sm:gap-5">
          <section className="panel p-4 sm:p-5" aria-labelledby="signal-summary">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              <SignalBadge type={signal.type} />
              <span className="tabular text-label-13 text-ds-gray-900">
                Score{" "}
                <span className="font-medium text-ds-gray-1000">
                  {formatScore(signal.score)}
                </span>
              </span>
              {conversation?.customerName ? (
                <span className="min-w-0 truncate text-label-13 text-ds-gray-900">
                  · {conversation.customerName} · {conversation.channel}
                </span>
              ) : null}
            </div>
            <h2 id="signal-summary" className="sr-only">
              Signal summary
            </h2>
            <p className="mt-3 text-pretty text-copy-14 text-ds-gray-1000 sm:text-copy-16">
              {signal.summary}
            </p>
            <div className="mt-4 border-t border-ds-gray-400 pt-3">
              <h3 className="text-label-12 text-ds-gray-900">
                Suggested Next Action
              </h3>
              <p className="mt-1 text-pretty text-copy-14 text-ds-gray-1000">
                {signal.suggestedAction}
              </p>
              <p className="mt-1.5 text-pretty text-label-12 text-ds-gray-900">
                Display-only — copy into your CRM or chat tool; Sioona does not
                send messages.
              </p>
            </div>
            {signal.evidence.length > 0 ? (
              <div className="mt-4 border-t border-ds-gray-400 pt-3">
                <h3 className="text-label-12 text-ds-gray-900">
                  Why This Fired
                </h3>
                <ul className="mt-2 space-y-2">
                  {signal.evidence.map((item) => {
                    const { kind, text } = formatEvidenceItem(item);
                    return (
                      <li key={item} className="min-w-0 text-copy-14">
                        {kind === "quote" ? (
                          <blockquote className="border-l-2 border-ds-gray-500 pl-3 text-pretty text-ds-gray-1000">
                            “{text}”
                          </blockquote>
                        ) : (
                          <span className="text-pretty text-ds-gray-900">
                            {text}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          <FeedbackControls signal={signal} />

          {conversation ? (
            <GroundTruthControl
              conversationId={conversation.id}
              groundTruth={conversation.groundTruth}
            />
          ) : null}
        </div>

        <section
          className="panel flex flex-col p-4 sm:p-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]"
          aria-labelledby="conversation-heading"
        >
          <h2
            id="conversation-heading"
            className="shrink-0 text-balance text-heading-16 text-ds-gray-1000"
          >
            Conversation
          </h2>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
              <p className="text-copy-14 text-ds-gray-1000">
                No messages stored
              </p>
              <p className="mt-1 text-pretty text-copy-14 text-ds-gray-900">
                Re-upload the chat export or open another signal.
              </p>
              <Link href={viewHref("insights")} className="btn-secondary mt-4">
                Back to Queue
              </Link>
            </div>
          ) : (
            <>
              <ol className="mt-4 min-h-0 space-y-2 lg:overflow-y-auto">
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
                    <p className="text-pretty break-words">{message.content}</p>
                  </li>
                ))}
              </ol>
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
        </section>
      </div>
    </div>
  );
}
