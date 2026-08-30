"use client";

import { useState } from "react";
import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
import { firstEvidenceMessageId } from "@/lib/evidence-messages";
import { signalTypeLabel } from "@/lib/format";
import type { Message, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewPairProps = {
  signal: Signal;
  messages: Message[];
  customerName: string;
  className?: string;
};

/**
 * Insights review pair — one metric-strip: conversation chat well |
 * Suggested Next Action + Why This Fired. Why quotes jump the transcript.
 * Parent should key this on `signal.id` so highlight resets per review.
 */
export function SignalReviewPair({
  signal,
  messages,
  customerName,
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
        typeLabel={signalTypeLabel(signal.type)}
        summary={signal.summary || ""}
        highlightedMessageId={focusedMessageId}
        className="min-h-0 lg:h-full"
      />
      <SignalReviewSuggestedAction
        signal={signal}
        messages={messages}
        focusedMessageId={focusedMessageId}
        onFocusMessage={setFocusedMessageId}
        className="min-h-0 lg:h-full"
      />
    </div>
  );
}
