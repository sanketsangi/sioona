"use client";

import { useState } from "react";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
import type { MarkActedWalk } from "@/lib/use-mark-acted";
import type { SignalReviewTriage } from "@/lib/views";
import { firstEvidenceMessageId } from "@/lib/evidence-messages";
import type { Conversation, Message, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewBodyProps = {
  signal: Signal;
  messages: Message[];
  customerName: string;
  conversation: Conversation | null;
  triage?: SignalReviewTriage;
  /** Follow-up Act queue — rail primary Mark as Acted. */
  actedWalk?: MarkActedWalk | null;
  className?: string;
};

/**
 * Insights review body: Conversation well and review rail as sibling
 * cards (gap-4). Narrow stacks Why → Conversation → Feedback; wide is
 * ~57.25% rail | ~42.75% Conversation. Highlight resets when `signal.id`
 * changes (parent should key this).
 */
export function SignalReviewBody({
  signal,
  messages,
  customerName,
  conversation,
  triage,
  actedWalk = null,
  className,
}: SignalReviewBodyProps) {
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(() =>
    firstEvidenceMessageId(signal.evidence, messages),
  );

  return (
    <div
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
          onFocusMessage={setFocusedMessageId}
          actedWalk={actedWalk}
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
      <SignalReviewConversation
        messages={messages}
        customerName={customerName}
        highlightedMessageId={focusedMessageId}
        className="insights-review-well overflow-hidden"
      />
    </div>
  );
}
