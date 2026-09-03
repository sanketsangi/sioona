"use client";

import { useId } from "react";
import { ConversationMessages } from "@/components/ConversationMessages";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewTranscriptProps = {
  messages: Message[];
  customerName: string;
  highlightedMessageId?: string | null;
  className?: string;
};

/**
 * In-queue conversation — Why This Fired jumps land here via MessageScroller.
 * Empty copy matches the drawer (no invented transcript).
 */
export function SignalReviewTranscript({
  messages,
  customerName,
  highlightedMessageId = null,
  className,
}: SignalReviewTranscriptProps) {
  const headingId = useId();
  const who = customerName.trim() || "Customer";
  const messageCount = messages.filter((m) => m.role !== "system").length;
  const hasMessages = messages.length > 0;

  return (
    <section
      data-review-slot="transcript"
      className={cn("insights-review-pane h-full", className)}
      aria-labelledby={headingId}
    >
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b border-sio-border-base px-3 py-2">
        <h3
          id={headingId}
          className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
        >
          Conversation
        </h3>
        {messageCount > 0 ? (
          <p className="tabular text-label-12 text-sio-fg-muted">
            {messageCount} {messageCount === 1 ? "message" : "messages"}
          </p>
        ) : null}
      </div>

      {hasMessages ? (
        <MessageScrollerProvider
          autoScroll={false}
          defaultScrollPosition="start"
          scrollMargin={12}
          scrollPreviousItemPeek={0}
        >
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport
              className="scroll-region px-1 py-4 sm:px-2 sm:py-5"
              aria-label="Conversation"
            >
              <MessageScrollerContent className="mx-auto w-full max-w-md">
                <ConversationMessages
                  messages={messages}
                  customerName={who}
                  highlightedMessageId={highlightedMessageId}
                />
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      ) : (
        <div className="scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-4 sm:px-2 sm:py-5">
          <div className="mx-auto flex min-h-[12rem] w-full max-w-md flex-col items-center justify-center px-2 text-center">
            <p className="text-copy-14 text-sio-fg-base">No messages stored</p>
            <p className="mt-1 max-w-xs text-pretty text-label-13 text-sio-fg-muted">
              Re-upload or re-detect to attach the transcript. No invented
              chat.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
