"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
import type { MarkActedWalk } from "@/lib/use-mark-acted";
import type { SignalReviewTriage } from "@/lib/views";
import { firstEvidenceMessageId } from "@/lib/evidence-messages";
import type {
  Conversation,
  Message,
  Signal,
  SupervisedAction,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Matches `@container review (min-width: 56rem)` — inline chat vs drawer. */
const REVIEW_SPLIT_MIN_PX = 56 * 16;

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
 * Insights review body: Conversation well and review rail as sibling
 * cards (gap-4). Narrow: Recommended Actions → Feedback; Conversation
 * opens in a right Drawer (Open Conversation / Why This Fired). Wide:
 * flexible rail | fixed 385px Conversation. Highlight resets when
 * `signal.id` changes (parent should key this).
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
  const [splitWide, setSplitWide] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(() =>
    firstEvidenceMessageId(signal.evidence, messages),
  );

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

  const focusMessage = useCallback(
    (messageId: string) => {
      setFocusedMessageId(messageId);
      // Narrow: inline transcript is hidden — open the drawer and land there.
      if (!splitWide) setDrawerOpen(true);
    },
    [splitWide],
  );

  return (
    <div
      ref={splitRef}
      id={`signal-review-body-${signal.id}`}
      className={cn("insights-review-split", className)}
      aria-labelledby={`signal-review-heading-${signal.id}`}
    >
      <div className="insights-review-rail">
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
        <div
          data-review-slot="feedback"
          className="insights-review-feedback"
        >
          <FeedbackControls
            signal={signal}
            className="insights-review-pane insights-review-well overflow-hidden"
            triage={triage}
          />
          {conversation ? (
            <GroundTruthControl
              conversationId={conversation.id}
              groundTruth={conversation.groundTruth}
              className="insights-review-pane insights-review-well overflow-hidden"
            />
          ) : null}
        </div>
      </div>
      {/*
        Wide: inline 385px well. Narrow: CSS hides the slot; unmount while the
        Why This Fired drawer is open so message DOM ids stay unique.
      */}
      {splitWide || !drawerOpen ? (
        <SignalReviewConversation
          messages={messages}
          customerName={customerName}
          highlightedMessageId={focusedMessageId}
          className="insights-review-well overflow-hidden"
        />
      ) : null}
      {/* Why This Fired drawer when the inline well is hidden (narrow). */}
      <ConversationDrawer
        messages={messages}
        customerName={customerName}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        highlightedMessageId={focusedMessageId}
        showTrigger={false}
      />
    </div>
  );
}
