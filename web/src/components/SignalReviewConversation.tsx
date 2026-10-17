"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ConversationMessages } from "@/components/ConversationMessages";
import { REVIEW_PANE_TITLE_CLASS } from "@/components/InsightsReviewPaneHeader";
import { SignalUser } from "@/components/SignalUser";
import { Button } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { Message as ChatMessage } from "@/lib/types";
import { viewHref } from "@/lib/views";
import { cn } from "@/lib/utils";

type SignalReviewConversationProps = {
  messages: ChatMessage[];
  customerName: string;
  highlightedMessageId?: string | null;
  evidenceJumpKey?: number;
  evidenceSpans?: import("@/lib/types").Signal["evidenceSpans"];
  /** Optional trailing header control (e.g. drawer Close). */
  headerAction?: ReactNode;
  className?: string;
};

/**
 * Insights review messaging well — sticky customer header + MessageScroller
 * transcript (June 2026 shadcn chat + scroll-fade). Why This Fired jumps land
 * via scrollToMessage on evidence bubbles. Bubble clocks stay off. Empty is
 * honest (no invented chat). Same chrome in the inline well and Conversation
 * Drawer. No Attachment / composer / streaming chrome.
 */
export function SignalReviewConversation({
  messages,
  customerName,
  highlightedMessageId = null,
  evidenceSpans = [],
  evidenceJumpKey = 0,
  headerAction = null,
  className,
}: SignalReviewConversationProps) {
  const headingId = useId();
  const who = customerName.trim() || "Customer";
  const hasMessages = messages.length > 0;

  return (
    <section
      data-review-slot="transcript"
      className={cn(
        "insights-review-pane insights-review-chat flex min-h-0 min-w-0 flex-col bg-sio-bg-base",
        className,
      )}
      aria-labelledby={headingId}
    >
      <header className="insights-review-chat-header">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SignalUser name={who} size={32} showName={false} />
          <h3
            id={headingId}
            translate="no"
            className={REVIEW_PANE_TITLE_CLASS}
          >
            {who}
          </h3>
        </div>
        {headerAction ? (
          <div className="flex shrink-0 items-center">{headerAction}</div>
        ) : null}
      </header>

      {hasMessages ? (
        <MessageScrollerProvider
          autoScroll={false}
          defaultScrollPosition="start"
          scrollMargin={12}
          scrollPreviousItemPeek={0}
        >
          <MessageScroller className="insights-review-chat-body min-h-0 flex-auto">
            <MessageScrollerViewport
              className="scroll-region"
              aria-label={`${who} conversation`}
            >
              <MessageScrollerContent>
                <ConversationMessages
                  messages={messages}
                  customerName={who}
                  highlightedMessageId={highlightedMessageId}
                  evidenceSpans={evidenceSpans}
                  evidenceJumpKey={evidenceJumpKey}
                />
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      ) : (
        <div className="insights-review-chat-body scroll-region min-h-0 flex-auto overflow-y-auto overscroll-contain">
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-center">
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
              className="min-h-11 touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive"
            >
              <Link href={viewHref("upload")}>Uploaded Chats</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
