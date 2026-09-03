"use client";

import { useState } from "react";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
import { firstEvidenceMessageId } from "@/lib/evidence-messages";
import type { Message, Signal, SupervisedAction } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewPairProps = {
  signal: Signal;
  messages: Message[];
  customerName: string;
  supervisedAction?: SupervisedAction | null;
  className?: string;
};

/**
 * Insights review pair — one metric-strip: conversation chat well
 * (sticky customer header, full transcript) | Recommended Actions
 * (Why / Matched / Retention Email nested). Why quotes jump the
 * transcript. Parent should key this on `signal.id` so highlight
 * resets per review.
 */
export function SignalReviewPair({
  signal,
  messages,
  customerName,
  supervisedAction = null,
  className,
}: SignalReviewPairProps) {
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(() =>
    firstEvidenceMessageId(signal.evidence, messages),
  );

  return (
    <div
      className={cn(
        "metric-strip grid min-h-0 min-w-0 grid-cols-1 divide-y divide-sio-border-base lg:grid-cols-2 lg:divide-x lg:divide-y-0",
        className,
      )}
    >
      <SignalReviewConversation
        messages={messages}
        customerName={customerName}
        highlightedMessageId={focusedMessageId}
        className="min-h-0 lg:h-full"
      />
      <SignalReviewSuggestedAction
        signal={signal}
        messages={messages}
        customerName={customerName}
        focusedMessageId={focusedMessageId}
        onFocusMessage={setFocusedMessageId}
        supervisedAction={supervisedAction}
        className="min-h-0"
      />
    </div>
  );
}
