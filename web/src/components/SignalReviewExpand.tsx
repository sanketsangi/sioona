"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { ReDetectButton } from "@/components/ReDetectButton";
import { Separator } from "@/components/ui/separator";
import {
  formatEvidenceItem,
  signalTypeLabel,
} from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import { viewHref } from "@/lib/views";
import type { Conversation, Message, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_WHY_ITEMS = 2;
/** Shared open/close duration — keep row unwrap in sync with ExpandRegion. */
export const EXPAND_MS = 220;

/** Compositor-friendly expand/collapse (grid-template-rows); honors reduced motion. */
export function ExpandRegion({
  open,
  id,
  labelledBy,
  children,
}: {
  open: boolean;
  id: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setRender(true);
      // Double rAF so the browser paints grid-rows-[0fr] before opening.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(
      () => setRender(false),
      reduced ? 0 : EXPAND_MS,
    );
    return () => clearTimeout(t);
  }, [open]);

  if (!render) return null;

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      className={cn(
        "grid transition-[grid-template-rows] ease-out motion-reduce:transition-none",
        shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
      style={{ transitionDuration: `${EXPAND_MS}ms` }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "transition-opacity ease-out motion-reduce:transition-none",
            shown ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: `${EXPAND_MS}ms` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type SignalReviewExpandProps = {
  signal: Signal;
  customerName: string;
  messages: Message[];
  conversation?: Conversation | null;
  /** Heading id for aria-labelledby (row summary). */
  labelledBy?: string;
};

/**
 * In-queue review body — opens downward under fixed truncated row chrome.
 */
export function SignalReviewExpand({
  signal,
  customerName,
  messages,
  conversation = null,
  labelledBy,
}: SignalReviewExpandProps) {
  const isNeonStub = isNeonStubSignalId(signal.id);
  const who = customerName.trim() || "Customer";
  const typeLabel = signalTypeLabel(signal.type);
  const evidenceItems = signal.evidence.slice(0, MAX_WHY_ITEMS);
  const missingLocalJoin = isNeonStub || !signal.suggestedAction;
  const canOpenConversation = messages.length > 0;
  const showJoinRecovery = isNeonStub && !canOpenConversation && !conversation;

  return (
    <div
      className="flex flex-col gap-3 border-t border-sio-border-base bg-sio-bg-subtle px-3 pb-3.5 pt-3 sm:px-3.5"
      aria-labelledby={labelledBy}
    >
      {/* Suggested Next Action + Why This Fired */}
      <div className="overflow-hidden rounded-md border border-sio-border-base bg-sio-bg-base">
        <div className="flex flex-col sm:flex-row">
          <section className="min-w-0 flex-1 px-3 py-2.5 sm:px-3.5">
            <h3 className="text-label-12 font-medium text-sio-fg-muted">
              Suggested Next Action
            </h3>
            <p className="mt-1 line-clamp-2 break-words text-pretty text-copy-14 text-sio-fg-base">
              {missingLocalJoin
                ? "Unavailable — local detection join missing."
                : signal.suggestedAction}
            </p>
            <p className="mt-0.5 text-label-12 text-sio-fg-muted">
              Display-only — not sent by Sioona.
            </p>
          </section>

          <Separator
            orientation="horizontal"
            className="bg-sio-border-base sm:hidden"
          />
          <Separator
            orientation="vertical"
            className="hidden bg-sio-border-base sm:block sm:h-auto sm:self-stretch"
          />

          <section className="min-w-0 flex-1 px-3 py-2.5 sm:px-3.5">
            <h3 className="text-label-12 font-medium text-sio-fg-muted">
              Why This Fired
            </h3>
            {evidenceItems.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {evidenceItems.map((item) => {
                  const { kind, text } = formatEvidenceItem(item);
                  return (
                    <li key={item} className="min-w-0 text-copy-14">
                      {kind === "quote" ? (
                        <p className="line-clamp-2 break-words text-pretty text-sio-fg-subtle">
                          “{text}”
                        </p>
                      ) : (
                        <p className="line-clamp-2 break-words text-label-12 text-sio-fg-muted">
                          {text}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-copy-14 text-sio-fg-muted">
                {isNeonStub
                  ? "No local evidence — detection join missing."
                  : "No local evidence."}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Conversation → Feedback → Ground Truth */}
      <div className="flex flex-wrap items-center gap-2">
        {canOpenConversation ? (
          <ConversationDrawer
            messages={messages}
            customerName={who}
            typeLabel={typeLabel}
            summary={signal.summary || ""}
            triggerLabel="Open Conversation"
            footer={null}
          />
        ) : showJoinRecovery ? (
          <div
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5"
            role="status"
          >
            <p className="text-label-13 text-sio-fg-muted">
              No local conversation
            </p>
            <Link
              href={viewHref("upload")}
              className="link-accent text-label-13"
            >
              Upload Chats
            </Link>
            <ReDetectButton className="h-8 min-h-8 px-2.5 text-label-13 md:h-8" />
          </div>
        ) : (
          <p className="text-label-13 text-sio-fg-muted" role="status">
            No messages stored
          </p>
        )}
      </div>

      <FeedbackControls signal={signal} />

      {conversation ? (
        <GroundTruthControl
          conversationId={conversation.id}
          groundTruth={conversation.groundTruth}
        />
      ) : null}
    </div>
  );
}
