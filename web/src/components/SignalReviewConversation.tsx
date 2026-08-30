import Link from "next/link";
import { useId } from "react";
import { ConversationMessages } from "@/components/ConversationMessages";
import { evalCardHeaderClassName } from "@/components/EvalCard";
import { SignalUser } from "@/components/SignalUser";
import { Button } from "@/components/ui/button";
import type { Message as ChatMessage } from "@/lib/types";
import { viewHref } from "@/lib/views";
import { cn } from "@/lib/utils";

type SignalReviewConversationProps = {
  messages: ChatMessage[];
  customerName: string;
  highlightedMessageId?: string | null;
  className?: string;
};

/**
 * Insights review messaging well — sticky customer header + full-height
 * transcript. Why This Fired jumps land on native evidence bubbles.
 * Empty is honest (no invented chat). Drawer lives on the page header.
 */
export function SignalReviewConversation({
  messages,
  customerName,
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
        "insights-review-pane insights-review-chat flex h-full min-h-0 min-w-0 flex-col bg-sio-bg-subtle",
        className,
      )}
      aria-labelledby={headingId}
    >
      <header
        className={cn("insights-review-chat-header", evalCardHeaderClassName)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SignalUser name={who} size={32} showName={false} />
          <div className="min-w-0 flex-1">
            <h3
              id={headingId}
              translate="no"
              className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
            >
              {who}
            </h3>
            <p className="mt-0.5 truncate text-label-12 text-sio-fg-muted">
              Conversation
              {messageCount > 0 ? (
                <span className="tabular-nums">
                  {" "}
                  · {messageCount} {messageCount === 1 ? "message" : "messages"}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="insights-review-chat-body scroll-region min-h-[14rem] flex-1 overflow-y-auto overscroll-contain px-1 py-4 sm:px-2 sm:py-5">
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
          <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 px-3 text-center">
            <div className="flex flex-col gap-1">
              <p className="text-copy-14 text-sio-fg-base">No messages stored</p>
              <p className="max-w-xs text-pretty text-label-13 text-sio-fg-muted">
                Re-upload or re-detect to attach the transcript. No invented
                chat.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-11 touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive md:min-h-9"
            >
              <Link href={viewHref("upload")}>Upload Chats</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
