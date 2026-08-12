"use client";

import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react/ssr";
import { ConversationMessages } from "@/components/ConversationMessages";
import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/Drawer";
import type { Message as ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Full conversation transcript in a Drawer.
 * Insights accordion: trigger “Open Conversation” / “See Conversation”.
 * Full transcript scrolls inside the drawer (not inline).
 */
export function ConversationDrawer({
  messages,
  customerName,
  typeLabel: _typeLabel,
  summary: _summary,
  triggerLabel = "See Conversation",
  footer = null,
}: {
  messages: ChatMessage[];
  customerName: string;
  /** Kept for caller compat; drawer no longer shows type/summary chrome. */
  typeLabel: string;
  /** Kept for caller compat; drawer no longer shows type/summary chrome. */
  summary: string;
  /** Title Case trigger label. */
  triggerLabel?: "See Conversation" | "Open Conversation" | string;
  /** Optional custom footer; default none (review lives in-queue). */
  footer?: ReactNode | null;
}) {
  const who = customerName.trim() || "Customer";

  return (
    <Drawer>
      <DrawerTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-11 min-h-11 border-sio-border-subtle bg-transparent text-sm shadow-none hover:border-sio-border-strong hover:bg-sio-bg-interactive hover:text-sio-fg-base md:h-8 md:min-h-8",
        )}
      >
        {triggerLabel}
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader>
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DrawerTitle>Conversation</DrawerTitle>
              <DrawerDescription translate="no" className="mt-0.5">
                {who}
              </DrawerDescription>
            </div>
            <DrawerClose
              className="btn-tertiary size-11 shrink-0 px-0 md:size-9"
              aria-label="Close"
            >
              <X className="size-5" weight="bold" aria-hidden />
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3">
          <div className="mx-auto w-full max-w-md">
            {messages.length === 0 ? (
              <div className="flex min-h-[12rem] flex-col items-center justify-center px-2 text-center">
                <p className="text-copy-14 text-sio-fg-base">No messages stored</p>
                <p className="mt-1 max-w-xs text-pretty text-label-13 text-sio-fg-muted">
                  Re-upload or re-detect to attach the transcript. No invented
                  chat.
                </p>
              </div>
            ) : (
              <ConversationMessages
                messages={messages}
                customerName={who}
              />
            )}
          </div>
        </div>

        {footer ? (
          <DrawerFooter
            role="group"
            aria-label="Conversation actions"
            className="justify-center"
          >
            <div className="flex w-full max-w-md flex-wrap gap-2 md:[&_a]:h-9">
              {footer}
            </div>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
