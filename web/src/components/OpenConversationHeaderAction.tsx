"use client";

import { ConversationDrawer } from "@/components/ConversationDrawer";
import { useConversationDrawerControl } from "@/components/conversation-drawer-control";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type OpenConversationHeaderActionProps = {
  messages: Message[];
  customerName: string;
  typeLabel?: string;
  summary?: string;
};

const triggerClassName = cn(
  buttonVariants({ variant: "outline", size: "default" }),
  "h-8 gap-2 shrink-0",
);

/**
 * Sticky review header control — Open Conversation after Skip (or alone when
 * the pending walk is empty). Outline h-8 chrome matches Prev / Next / Skip.
 * When wrapped in ConversationDrawerControlProvider, toggles the shared drawer
 * owned by SignalReviewBody; otherwise mounts its own ConversationDrawer.
 */
export function OpenConversationHeaderAction({
  messages,
  customerName,
  typeLabel,
  summary,
}: OpenConversationHeaderActionProps) {
  const control = useConversationDrawerControl();
  if (messages.length === 0) return null;
  // Drawer is the overflow path. The transcript is already on screen.
  if (control?.inlineTranscript) return null;

  const who = customerName.trim() || "Customer";

  if (control) {
    return (
      <Button
        type="button"
        variant="outline"
        size="default"
        className={triggerClassName}
        aria-expanded={control.open}
        aria-haspopup="dialog"
        onClick={() => control.setOpen(true)}
      >
        Open Conversation
      </Button>
    );
  }

  return (
    <ConversationDrawer
      messages={messages}
      customerName={who}
      typeLabel={typeLabel}
      summary={summary}
      triggerLabel="Open Conversation"
      triggerClassName={triggerClassName}
      footer={null}
    />
  );
}
