"use client";

import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react/ssr";
import { AgentBotIcon } from "@/components/icons/AgentBotIcon";
import { ConversationMessages } from "@/components/ConversationMessages";
import { Avatar } from "@/components/ui/Avatar";
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
  triggerLabel = "See Conversation",
  triggerClassName,
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
  /** Override trigger chrome; default is `btn-secondary`. */
  triggerClassName?: string;
  /** Optional custom footer; default none (review lives in-queue). */
  footer?: ReactNode | null;
}) {
  const who = customerName.trim() || "Customer";
  const messageCount = messages.filter((m) => m.role !== "system").length;

  return (
    <Drawer>
      <DrawerTrigger className={cn("btn-secondary", triggerClassName)}>
        {triggerLabel}
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader>
          <div className="flex w-full min-w-0 items-center gap-3">
            <Avatar
              placeholder
              size={40}
              className="shrink-0 text-sio-fg-subtle"
            >
              <AgentBotIcon className="size-4 shrink-0" />
            </Avatar>

            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-label-14 font-semibold leading-5">
                Conversation
              </DrawerTitle>
              <DrawerDescription
                translate="no"
                className="mt-0.5 flex min-w-0 items-center gap-1.5"
              >
                <span className="status-dot status-dot-queued" aria-hidden>
                  <span className="status-dot-indicator !size-1.5" />
                </span>
                <span className="min-w-0 truncate">
                  {who}
                  {messageCount > 0 ? (
                    <span className="text-sio-fg-muted">
                      {" "}
                      · {messageCount}{" "}
                      {messageCount === 1 ? "message" : "messages"}
                    </span>
                  ) : null}
                </span>
              </DrawerDescription>
            </div>

            <DrawerClose
              className="btn-tertiary size-11 min-h-11 shrink-0 rounded-[var(--radius-control)] px-0 md:size-9 md:min-h-0"
              aria-label="Close"
            >
              <X className="size-5" weight="bold" aria-hidden />
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-4 sm:px-2 sm:py-5">
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
