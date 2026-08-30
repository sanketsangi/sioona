"use client";

import { useId } from "react";
import Link from "next/link";
import { ConversationMessages } from "@/components/ConversationMessages";
import { EmptyState } from "@/components/EmptyState";
import { ChatBubbleIcon } from "@/components/icons/ChatBubbleIcon";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { viewHref } from "@/lib/views";

type SignalReviewTranscriptProps = {
  messages: Message[];
  customerName: string;
  highlightedMessageId?: string | null;
  className?: string;
};

/**
 * In-queue conversation — Why This Fired jumps land here.
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

      <div className="scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-4 sm:px-2 sm:py-5">
        <div className="mx-auto w-full max-w-md">
          {messages.length === 0 ? (
            <EmptyState
              title="No messages stored"
              description="Re-upload or re-detect to attach the transcript. No invented chat."
              icon={<ChatBubbleIcon className="size-4" />}
              className="min-h-[12rem] py-6 sm:py-8"
            >
              <Link href={viewHref("upload")} className="btn-secondary mt-4">
                Upload Chats
              </Link>
            </EmptyState>
          ) : (
            <ConversationMessages
              messages={messages}
              customerName={who}
              highlightedMessageId={highlightedMessageId}
            />
          )}
        </div>
      </div>
    </section>
  );
}
