import Link from "next/link";
import { useId } from "react";
import { ConversationMessages } from "@/components/ConversationMessages";
import {
  evalCardHeaderClassName,
  evalCardPadClassName,
} from "@/components/EvalCard";
import { REVIEW_PANE_TITLE_CLASS } from "@/components/InsightsReviewPaneHeader";
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
 * Insights review messaging well — sticky customer header + transcript that
 * hugs the thread up to the column, then scrolls. Why This Fired jumps land
 * on native evidence bubbles. Bubble clocks stay off (drawer keeps them).
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
  const hasMessages = messages.length > 0;

  return (
    <section
      data-review-slot="transcript"
      className={cn(
        "insights-review-pane insights-review-chat flex min-h-0 min-w-0 flex-col bg-sio-bg-subtle",
        className,
      )}
      aria-labelledby={headingId}
    >
      <header
        className={cn("insights-review-chat-header", evalCardHeaderClassName)}
      >
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
      </header>

      <div
        className={cn(
          "insights-review-chat-body scroll-region min-h-0 flex-auto overflow-y-auto overscroll-contain py-3",
          evalCardPadClassName,
        )}
      >
        {hasMessages ? (
          <div className="mx-auto w-full max-w-md">
            <ConversationMessages
              messages={messages}
              customerName={who}
              highlightedMessageId={highlightedMessageId}
            />
          </div>
        ) : (
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
