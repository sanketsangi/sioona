"use client";

import { ConversationDrawer } from "@/components/ConversationDrawer";
import { useReviewConversation } from "@/components/ReviewConversationContext";
import { buttonVariants } from "@/components/ui/button";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type OpenConversationHeaderActionProps = {
  messages: Message[];
  customerName: string;
  typeLabel?: string;
  summary?: string;
};

/**
 * Insights review header — Open Conversation beside Prev / Next / Skip.
 * Owns the shared ConversationDrawer; Why This Fired opens via context.
 */
export function OpenConversationHeaderAction({
  messages,
  customerName,
  typeLabel,
  summary,
}: OpenConversationHeaderActionProps) {
  const { open, setOpen, highlightedMessageId } = useReviewConversation();

  if (messages.length === 0) return null;

  const who = customerName.trim() || "Customer";

  return (
    <ConversationDrawer
      messages={messages}
      customerName={who}
      typeLabel={typeLabel}
      summary={summary}
      open={open}
      onOpenChange={setOpen}
      highlightedMessageId={highlightedMessageId}
      triggerLabel="Open Conversation"
      triggerClassName={cn(
        buttonVariants({ variant: "outline", size: "default" }),
        "h-8 gap-2 shrink-0",
      )}
      footer={null}
    />
  );
}
