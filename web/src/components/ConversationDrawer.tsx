"use client";

import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react/ssr";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/Drawer";
import type { Message as ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Match Insights pager Skip / Prev / Next outline chrome. */
const defaultTriggerClass = cn(
  buttonVariants({ variant: "outline", size: "default" }),
  "h-8 gap-2 shrink-0",
);

/**
 * Conversation transcript in a right-side Drawer.
 * Panel is the same 385px SignalReviewConversation chrome as the inline well
 * (no separate drawer padding / timestamps / max-w-lg).
 */
export function ConversationDrawer({
  messages,
  customerName,
  triggerLabel = "See Conversation",
  triggerClassName,
  footer = null,
  open,
  onOpenChange,
  highlightedMessageId = null,
  evidenceSpans = [],
  evidenceJumpKey = 0,
  showTrigger = true,
}: {
  messages: ChatMessage[];
  customerName: string;
  /** Kept for caller compat; drawer no longer shows type/summary chrome. */
  typeLabel?: string;
  /** Kept for caller compat; drawer no longer shows type/summary chrome. */
  summary?: string;
  /** Title Case trigger label. */
  triggerLabel?: "See Conversation" | "Open Conversation" | string;
  /** Override trigger chrome; default matches outline Button. */
  triggerClassName?: string;
  /** Optional custom footer; default none (review lives in-queue). */
  footer?: ReactNode | null;
  /** Controlled open — Why This Fired / external Open Conversation. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Evidence landing inside the drawer transcript. */
  highlightedMessageId?: string | null;
  evidenceJumpKey?: number;
  evidenceSpans?: import("@/lib/types").Signal["evidenceSpans"];
  /** False when a parent owns the open control (Why This Fired). */
  showTrigger?: boolean;
}) {
  const who = customerName.trim() || "Customer";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DrawerTrigger className={cn(triggerClassName ?? defaultTriggerClass)}>
          {triggerLabel}
        </DrawerTrigger>
      ) : null}

      <DrawerContent className="conversation-drawer-panel--chat">
        <DrawerTitle className="sr-only">{who}</DrawerTitle>
        <DrawerDescription className="sr-only">
          Conversation transcript
        </DrawerDescription>
        <SignalReviewConversation
          messages={messages}
          customerName={who}
          highlightedMessageId={highlightedMessageId}
                  evidenceSpans={evidenceSpans}
                  evidenceJumpKey={evidenceJumpKey}
          className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[inherit] border-0"
          headerAction={
            <DrawerClose
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-lg" }),
                "size-8 min-h-8 shrink-0 text-sio-fg-subtle hover:bg-sio-bg-interactive hover:text-sio-fg-base",
              )}
              aria-label="Close"
            >
              <X weight="bold" className="size-4" aria-hidden />
            </DrawerClose>
          }
        />
        {footer ? (
          <DrawerFooter
            role="group"
            aria-label="Conversation actions"
            className="justify-center"
          >
            <div className="flex w-full flex-wrap gap-2 md:[&_a]:h-9">
              {footer}
            </div>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
