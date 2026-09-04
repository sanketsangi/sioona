"use client";

import { ConversationDrawer } from "@/components/ConversationDrawer";
import { buttonVariants } from "@/components/ui/button";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type OpenConversationHeaderActionProps = {
  messages: Message[];
  customerName: string;
  typeLabel: string;
  summary: string;
};

/**
 * Insights header slot — Open Conversation beside Mark Acted when the review
 * panel is open and local messages exist.
 */
export function OpenConversationHeaderAction({
  messages,
  customerName,
  typeLabel,
  summary,
}: OpenConversationHeaderActionProps) {
  if (messages.length === 0) return null;

  const who = customerName.trim() || "Customer";

  return (
    <ConversationDrawer
      messages={messages}
      customerName={who}
      typeLabel={typeLabel}
      summary={summary}
      triggerLabel="Open Conversation"
      triggerClassName={cn(
        buttonVariants({ variant: "outline", size: "default" }),
        "h-8 gap-2 shrink-0",
      )}
      footer={null}
    />
  );
}
