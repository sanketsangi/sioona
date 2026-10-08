"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import {
  useConversationDrawerControl,
  useConversationDrawerOpen,
} from "@/components/conversation-drawer-control";
import { FeedbackControls } from "@/components/FeedbackControls";
import { SignalOutcomeControl } from "@/components/SignalOutcomeControl";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
import type { MarkActedWalk } from "@/lib/use-mark-acted";
import type { SignalReviewTriage } from "@/lib/views";
import { focusEvidenceMessageId } from "@/lib/evidence-messages";
import type {
  Conversation,
  Message,
  Signal,
  SupervisedAction,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Matches `@container review (min-width: 48rem)` — inline chat vs drawer. */
const REVIEW_SPLIT_MIN_PX = 48 * 16;

type SignalReviewBodyProps = {
  signal: Signal;
  messages: Message[];
  customerName: string;
  conversation: Conversation | null;
  triage?: SignalReviewTriage;
  /** Follow-up Act queue — rail primary Mark as Acted. */
  actedWalk?: MarkActedWalk | null;
  /** Stored supervised retention email draft, when one exists. */
  supervisedAction?: SupervisedAction | null;
  className?: string;
};

/**
 * Insights review: transcript beside Feedback, Recommended Actions, and Why
 * This Fired on a normal laptop. Narrow panes keep the conversation drawer.
 */
export function SignalReviewBody({
  signal,
  messages,
  customerName,
  conversation,
  triage,
  actedWalk = null,
  supervisedAction = null,
  className,
}: SignalReviewBodyProps) {
  const splitRef = useRef<HTMLDivElement>(null);
  const drawerControl = useConversationDrawerControl();
  const [splitWide, setSplitWide] = useState(false);
  const [localDrawerOpen, setLocalDrawerOpen] = useState(false);
  const { open: drawerOpen, setOpen: setDrawerOpen } = useConversationDrawerOpen(
    localDrawerOpen,
    setLocalDrawerOpen,
  );
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(() =>
    focusEvidenceMessageId(signal, messages),
  );

  useLayoutEffect(() => {
    const root =
      splitRef.current?.closest(".insights-review") ?? splitRef.current;
    if (!root) return;
    const update = () => {
      const wide = root.getBoundingClientRect().width >= REVIEW_SPLIT_MIN_PX;
      setSplitWide(wide);
      drawerControl?.setInlineTranscript(wide);
      if (wide) drawerControl?.setOpen(false);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [drawerControl]);

  const focusMessage = useCallback(
    (messageId: string) => {
      setFocusedMessageId(messageId);
      // Narrow: inline transcript is hidden — open the drawer and land there.
      if (!splitWide) setDrawerOpen(true);
    },
    [setDrawerOpen, splitWide],
  );

  return (
    <div
      ref={splitRef}
      id={`signal-review-body-${signal.id}`}
      className={cn("insights-review-split", className)}
      aria-labelledby={`signal-review-heading-${signal.id}`}
    >
      <div className="insights-review-rail">
        {/* Headless: sticky header Open Conversation + Why This Fired share this. */}
        {messages.length > 0 ? (
          <ConversationDrawer
            messages={messages}
            customerName={customerName}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            highlightedMessageId={focusedMessageId}
            showTrigger={false}
          />
        ) : null}
        <FeedbackControls
          signal={signal}
          triage={triage}
          conversationId={conversation?.id}
          groundTruth={conversation?.groundTruth}
        />
        {signal.feedback ? <SignalOutcomeControl signal={signal} /> : null}
        <SignalReviewSuggestedAction
          signal={signal}
          messages={messages}
          customerName={customerName}
          focusedMessageId={focusedMessageId}
          onFocusMessage={focusMessage}
          actedWalk={actedWalk}
          supervisedAction={supervisedAction}
        />
      </div>
      {/*
        Wide: inline 385px well. Narrow: CSS hides the slot; unmount while the
        drawer is open so message DOM ids stay unique (header + evidence share
        one drawer).
      */}
      {!drawerOpen ? (
        <SignalReviewConversation
          messages={messages}
          customerName={customerName}
          highlightedMessageId={focusedMessageId}
          className="insights-review-well overflow-hidden"
        />
      ) : null}
    </div>
  );
}
