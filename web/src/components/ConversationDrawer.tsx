"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, X } from "@phosphor-icons/react/ssr";
import { ConversationMessages } from "@/components/ConversationMessages";
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

/**
 * Full conversation transcript in a Drawer.
 * Insights: trigger “See Conversation” + detail footer (inline in preview).
 * Signal Detail: trigger “Open Conversation” in the page header action row
 * (composed in SignalDetailView), no footer (already on detail).
 */
export function ConversationDrawer({
  messages,
  customerName,
  typeLabel: _typeLabel,
  summary: _summary,
  triggerLabel = "See Conversation",
  detailHref,
  footer,
}: {
  messages: ChatMessage[];
  customerName: string;
  /** Kept for caller compat; drawer no longer shows type/summary chrome. */
  typeLabel: string;
  /** Kept for caller compat; drawer no longer shows type/summary chrome. */
  summary: string;
  /** Title Case trigger label. */
  triggerLabel?: "See Conversation" | "Open Conversation" | string;
  /** When set and `footer` is omitted, shows Open Full Detail / Add Feedback. */
  detailHref?: string;
  /** Optional custom footer; pass `null` to hide when `detailHref` is set. */
  footer?: ReactNode | null;
}) {
  const who = customerName.trim() || "Customer";

  const resolvedFooter =
    footer !== undefined
      ? footer
      : detailHref
        ? (
            <>
              <Link href={detailHref} className="btn-primary">
                Open Full Detail
                <ArrowRight className="size-3.5" weight="bold" aria-hidden />
              </Link>
              <Link href={detailHref} className="btn-secondary">
                Add Feedback
              </Link>
            </>
          )
        : null;

  return (
    <Drawer>
      <DrawerTrigger className="btn-secondary min-h-6">
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
                  Open full detail after re-upload or re-detect to attach the
                  transcript.
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

        {resolvedFooter ? (
          <DrawerFooter
            role="group"
            aria-label="Conversation actions"
            className="justify-center"
          >
            <div className="flex w-full max-w-md flex-wrap gap-2">
              {resolvedFooter}
            </div>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
