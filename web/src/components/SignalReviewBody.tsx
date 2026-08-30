"use client";

import { useState } from "react";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
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
  className?: string;
};

/**
 * Insights review body: one split — Why → transcript → Feedback on a
 * narrow pane; transcript | rail when the review column is wide.
 * Highlight resets when `signal.id` changes (parent should key this).
 */
export function SignalReviewBody({
  signal,
  messages,
  customerName,
  conversation,
  triage,
  className,
}: SignalReviewBodyProps) {
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(() =>
    firstEvidenceMessageId(signal.evidence, messages),
  );

  return (
    <div
      id={`signal-review-body-${signal.id}`}
      data-review-keyboard-root=""
      className={cn("insights-review-split", className)}
      aria-labelledby={`signal-review-heading-${signal.id}`}
    >
      <SignalReviewConversation
        messages={messages}
        customerName={customerName}
        highlightedMessageId={focusedMessageId}
      />
      <div className="insights-review-rail">
        <SignalReviewSuggestedAction
          signal={signal}
          messages={messages}
          focusedMessageId={focusedMessageId}
          onFocusMessage={setFocusedMessageId}
        />
        <div
          data-review-slot="feedback"
          className="insights-review-feedback"
        >
          <FeedbackControls
            signal={signal}
            className="insights-review-pane"
            triage={triage}
          />
          {conversation ? (
            <GroundTruthControl
              conversationId={conversation.id}
              groundTruth={conversation.groundTruth}
              className="insights-review-pane"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
