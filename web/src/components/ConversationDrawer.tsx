"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react/ssr";
import { ConversationMessages } from "@/components/ConversationMessages";
import { EmptyState } from "@/components/EmptyState";
import { ChatBubbleIcon } from "@/components/icons/ChatBubbleIcon";
import { SignalUser } from "@/components/SignalUser";
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
import { viewHref } from "@/lib/views";

const defaultTriggerClass =
  "inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-sio-border-subtle bg-sio-bg-base px-3.5 text-sm font-medium text-sio-fg-base transition-[color,background-color,border-color] duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive md:h-9 md:min-h-9";

/**
 * Full conversation transcript in a Drawer.
 * Insights header: trigger “Open Conversation”. The in-queue well is
 * primary (`SignalReviewConversation`); this sheet is the overflow.
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
  /** Override trigger chrome; default matches outline Button. */
  triggerClassName?: string;
  /** Optional custom footer; default none (review lives in-queue). */
  footer?: ReactNode | null;
}) {
  const who = customerName.trim() || "Customer";
  const messageCount = messages.filter((m) => m.role !== "system").length;

  return (
    <Drawer>
      <DrawerTrigger className={cn(triggerClassName ?? defaultTriggerClass)}>
        {triggerLabel}
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader>
          <div className="flex w-full min-w-0 items-center gap-3">
            <SignalUser name={who} size={40} showName={false} />

            <div className="min-w-0 flex-1">
              <DrawerTitle
                translate="no"
                className="text-label-14 font-semibold leading-5"
              >
                {who}
              </DrawerTitle>
              <DrawerDescription className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span>Conversation</span>
                {messageCount > 0 ? (
                  <span className="min-w-0 truncate text-sio-fg-muted">
                    · {messageCount}{" "}
                    {messageCount === 1 ? "message" : "messages"}
                  </span>
                ) : null}
              </DrawerDescription>
            </div>

            <DrawerClose
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-lg" }),
                "size-11 min-h-11 shrink-0 text-sio-fg-subtle hover:bg-sio-bg-interactive hover:text-sio-fg-base md:size-9 md:min-h-9",
              )}
              aria-label="Close"
            >
              <X weight="bold" aria-hidden />
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-4 sm:px-2 sm:py-5">
          <div className="mx-auto w-full max-w-lg">
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
                showTimestamps
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
            <div className="flex w-full max-w-lg flex-wrap gap-2 md:[&_a]:h-9">
              {footer}
            </div>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
