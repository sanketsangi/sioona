import Link from "next/link";
import { useId } from "react";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { ConversationMessages } from "@/components/ConversationMessages";
import { SignalUser } from "@/components/SignalUser";
import type { Message as ChatMessage } from "@/lib/types";
import { viewHref } from "@/lib/views";
import { cn } from "@/lib/utils";

type SignalReviewConversationProps = {
  messages: ChatMessage[];
  customerName: string;
  typeLabel: string;
  summary: string;
  highlightedMessageId?: string | null;
  className?: string;
};

/**
 * Insights review conversation — chat well beside Suggested Next Action.
 * Full transcript scrolls here; drawer stays for the same column. Empty is
 * honest (no invented chat).
 */
export function SignalReviewConversation({
  messages,
  customerName,
  typeLabel,
  summary,
  highlightedMessageId = null,
  className,
}: SignalReviewConversationProps) {
  const headingId = useId();
  const who = customerName.trim() || "Customer";
  const messageCount = messages.filter((m) => m.role !== "system").length;
  const hasMessages = messages.length > 0;

  return (
    <section
      data-review-slot="transcript"
      className={cn(
        "insights-review-pane flex min-h-0 min-w-0 flex-col bg-sio-bg-subtle",
        className,
      )}
      aria-labelledby={headingId}
    >
      <div className="flex min-w-0 items-center gap-3 border-b border-sio-border-base bg-sio-bg-base px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
          >
            Conversation
          </h3>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <SignalUser name={who} size={24} className="min-w-0" />
            {messageCount > 0 ? (
              <span className="shrink-0 text-label-12 tabular-nums text-sio-fg-muted">
                · {messageCount} {messageCount === 1 ? "message" : "messages"}
              </span>
            ) : null}
          </div>
        </div>

        {hasMessages ? (
          <ConversationDrawer
            messages={messages}
            customerName={who}
            typeLabel={typeLabel}
            summary={summary}
            triggerLabel="See Conversation"
            triggerClassName="btn-tertiary shrink-0"
            footer={null}
          />
        ) : null}
      </div>

      <div className="scroll-region min-h-[14rem] flex-1 overflow-y-auto overscroll-contain px-1 py-4 sm:px-2 sm:py-5 lg:min-h-[20rem]">
        {hasMessages ? (
          <div className="mx-auto w-full max-w-md">
            <ConversationMessages
              messages={messages}
              customerName={who}
              highlightedMessageId={highlightedMessageId}
              showTimestamps
            />
          </div>
        ) : (
          <div className="flex min-h-[14rem] flex-col items-center justify-center px-3 text-center lg:min-h-[20rem]">
            <p className="text-copy-14 text-sio-fg-base">No messages stored</p>
            <p className="mt-1 max-w-xs text-pretty text-label-13 text-sio-fg-muted">
              Re-upload or re-detect to attach the transcript. No invented chat.
            </p>
            <Link href={viewHref("upload")} className="btn-secondary mt-3">
              Upload Chats
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
