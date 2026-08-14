"use client";

import { ConversationDrawer } from "@/components/ConversationDrawer";
import type { Message } from "@/lib/types";

type OpenConversationHeaderActionProps = {
  messages: Message[];
  customerName: string;
  typeLabel: string;
  summary: string;
};

/**
 * Insights header slot — Open Conversation beside Filters when the review
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
      triggerClassName="btn-secondary"
      footer={null}
    />
  );
}
