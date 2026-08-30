import Link from "next/link";
import { useId } from "react";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { ConversationMessages } from "@/components/ConversationMessages";
import { SignalUser } from "@/components/SignalUser";
import { previewTranscriptMessages } from "@/lib/format";
import type { Message as ChatMessage } from "@/lib/types";
import { viewHref } from "@/lib/views";
import { cn } from "@/lib/utils";

type SignalReviewConversationProps = {
  messages: ChatMessage[];
  customerName: string;
  typeLabel: string;
  summary: string;
  className?: string;
};

/**
 * Insights review conversation — metric-strip preview beside Suggested Next Action.
 * Full transcript stays in ConversationDrawer. Empty is honest (no invented chat).
 */
export function SignalReviewConversation({
  messages,
  customerName,
  typeLabel,
  summary,
  className,
}: SignalReviewConversationProps) {
  const headingId = useId();
  const who = customerName.trim() || "Customer";
  const { preview, hiddenCount, total } = previewTranscriptMessages(messages);
  const messageCount = messages.filter((m) => m.role !== "system").length;
  const hasMessages = messages.length > 0;

  return (
    <section
      className={cn("metric-strip flex min-h-0 flex-col", className)}
      aria-labelledby={headingId}
    >
      <div className="flex min-w-0 items-center gap-3 border-b border-sio-border-base px-3 py-2">
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
            triggerClassName="btn-secondary min-h-11 shrink-0 !rounded-full touch-manipulation sm:min-h-0 sm:h-8 sm:px-2.5"
            footer={null}
          />
        ) : null}
      </div>

      <div className="scroll-region min-h-[12rem] flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 lg:min-h-[18rem]">
        {hasMessages ? (
          <ConversationMessages
            messages={preview}
            customerName={who}
            showTimestamps
          />
        ) : (
          <div className="flex min-h-[12rem] flex-col items-center justify-center px-2 text-center lg:min-h-[18rem]">
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

      {hiddenCount > 0 ? (
        <p className="border-t border-sio-border-base px-3 py-2 text-label-12 text-sio-fg-muted">
          Showing last {preview.length} of {total} messages
        </p>
      ) : null}
    </section>
  );
}
