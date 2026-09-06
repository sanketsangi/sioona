"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { FeedbackControls } from "@/components/FeedbackControls";
import { useReviewConversationOptional } from "@/components/ReviewConversationContext";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
import type { MarkActedWalk } from "@/lib/use-mark-acted";
import type { SignalReviewTriage } from "@/lib/views";
import { firstEvidenceMessageId } from "@/lib/evidence-messages";
import type { Message, Signal, SupervisedAction } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Matches `@container review (min-width: 56rem)` — inline chat vs drawer. */
const REVIEW_SPLIT_MIN_PX = 56 * 16;

type SignalReviewBodyProps = {
  signal: Signal;
  messages: Message[];
  customerName: string;
  triage?: SignalReviewTriage;
  /** Follow-up Act queue — rail primary Mark as Acted. */
  actedWalk?: MarkActedWalk | null;
  /** Stored supervised retention email draft, when one exists. */
  supervisedAction?: SupervisedAction | null;
  className?: string;
};

/**
 * Insights review body: Conversation well and review rail as sibling
 * cards (gap-4). Narrow: Feedback → Recommended Actions → Why This Fired;
 * Conversation opens from the review header (Open Conversation) or
 * evidence focus. Wide: flexible rail | fixed 385px Conversation (always docked).
 * Highlight resets when `signal.id` changes (parent should key this).
 */
export function SignalReviewBody({
  signal,
  messages,
  customerName,
  triage,
  actedWalk = null,
  supervisedAction = null,
  className,
}: SignalReviewBodyProps) {
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitWide, setSplitWide] = useState(false);
  const shared = useReviewConversationOptional();
  const [localOpen, setLocalOpen] = useState(false);
  const [localFocusedMessageId, setLocalFocusedMessageId] = useState<
    string | null
  >(() => firstEvidenceMessageId(signal.evidence, messages));

  const drawerOpen = shared?.open ?? localOpen;
  const setDrawerOpen = shared?.setOpen ?? setLocalOpen;
  const focusedMessageId =
    shared?.highlightedMessageId ?? localFocusedMessageId;
  const setFocusedMessageId =
    shared?.setHighlightedMessageId ?? setLocalFocusedMessageId;

  useLayoutEffect(() => {
    const root =
      splitRef.current?.closest(".insights-review") ?? splitRef.current;
    if (!root) return;
    const update = () => {
      setSplitWide(root.getBoundingClientRect().width >= REVIEW_SPLIT_MIN_PX);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setFocusedMessageId(firstEvidenceMessageId(signal.evidence, messages));
    setDrawerOpen(false);
    // Reset shared header drawer when the preview signal changes (provider
    // outlives the keyed SignalReviewBody remount).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal.id only
  }, [signal.id]);

  const focusMessage = useCallback(
    (messageId: string) => {
      if (!splitWide && shared) {
        shared.openToMessage(messageId);
        return;
      }
      setFocusedMessageId(messageId);
      // Narrow without provider: open the local fallback drawer.
      if (!splitWide) setDrawerOpen(true);
    },
    [splitWide, setFocusedMessageId, setDrawerOpen, shared],
  );

  return (
    <div
      ref={splitRef}
      id={`signal-review-body-${signal.id}`}
      className={cn("insights-review-split", className)}
      aria-labelledby={`signal-review-heading-${signal.id}`}
    >
      <div className="insights-review-rail">
        {/*
          Fallback drawer when review chrome has no header provider
          (isolated tests). Production: Open Conversation lives in the
          sticky review header via ReviewConversationProvider.
        */}
        {!shared && !splitWide && messages.length > 0 ? (
          <ConversationDrawer
            messages={messages}
            customerName={customerName}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            highlightedMessageId={focusedMessageId}
            showTrigger={false}
          />
        ) : null}
        <div
          data-review-slot="feedback"
          className="insights-review-feedback"
        >
          <FeedbackControls
            signal={signal}
            className="insights-review-pane insights-review-well overflow-hidden"
            triage={triage}
          />
        </div>
        <SignalReviewSuggestedAction
          signal={signal}
          messages={messages}
          customerName={customerName}
          focusedMessageId={focusedMessageId}
          onFocusMessage={focusMessage}
          actedWalk={actedWalk}
          supervisedAction={supervisedAction}
          className="insights-review-pane insights-review-well overflow-hidden"
        />
      </div>
      {/*
        Wide: inline 385px well. Narrow: CSS hides the slot; unmount while the
        drawer is open so message DOM ids stay unique.
      */}
      {splitWide || !drawerOpen ? (
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
