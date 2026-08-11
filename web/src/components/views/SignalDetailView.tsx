import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import {
  customerNameFromExternalId,
  formatEvidenceItem,
  signalTypeLabel,
} from "@/lib/format";
import { viewHref } from "@/lib/views";
import type { Conversation, Message, Signal } from "@/lib/types";

const MAX_EVIDENCE_ITEMS = 2;

export function SignalDetailView({
  signal,
  conversation,
  messages,
  isNeonStub = false,
  /** Preserve Insights filters / banners when returning to the queue. */
  queueReturn,
}: {
  signal: Signal;
  conversation?: Conversation;
  messages: Message[];
  /** Neon needs-review row without a JSON conversation join. */
  isNeonStub?: boolean;
  queueReturn?: Record<string, string | undefined | null>;
}) {
  const displayName =
    conversation?.customerName?.trim() ||
    customerNameFromExternalId(conversation?.externalId) ||
    null;
  const who = displayName || "Customer";
  const typeLabel = signalTypeLabel(signal.type);
  const backHref = viewHref("insights", queueReturn);
  const evidenceItems = signal.evidence.slice(0, MAX_EVIDENCE_ITEMS);
  const canOpenConversation = !isNeonStub && messages.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-2.5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="btn-secondary self-start">
          <ArrowLeft className="size-3.5 shrink-0" weight="regular" aria-hidden />
          Back to Queue
        </Link>

        {canOpenConversation ? (
          <ConversationDrawer
            messages={messages}
            customerName={who}
            typeLabel={typeLabel}
            summary={signal.summary || ""}
            triggerLabel="Open Conversation"
            footer={null}
          />
        ) : (
          <p className="text-label-13 text-sio-fg-muted" role="status">
            {isNeonStub ? "No local conversation" : "No messages stored"}
          </p>
        )}
      </div>

      {isNeonStub ? (
        <div
          className="status-banner status-banner-warning shrink-0 py-2.5"
          role="status"
        >
          <p className="text-copy-14 text-sio-fg-base">
            Prediction is in Neon, but this conversation is not in the local
            store — no evidence or chat transcript to show. Re-run Detection or
            re-upload so dual-write can join evidence.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={viewHref("upload")} className="btn-secondary">
              Upload Chats
            </Link>
            <ReDetectButton />
          </div>
        </div>
      ) : null}

      <div className="scroll-region flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
        <div className="panel shrink-0 p-3 sm:p-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <SignalTypeChip type={signal.type} />
            <SignalScoreChip score={signal.score} />
            <SignalStatus signal={signal} />
            {displayName ? (
              <>
                <SignalUser name={displayName} />
                {conversation?.channel ? (
                  <span className="text-label-13 text-sio-fg-muted">
                    · {conversation.channel}
                  </span>
                ) : null}
              </>
            ) : isNeonStub ? (
              <span className="text-label-13 text-sio-fg-muted">
                · Neon prediction only
              </span>
            ) : null}
          </div>

          <p className="mt-2 line-clamp-2 break-words text-pretty text-copy-14 font-medium text-sio-fg-base">
            {signal.summary}
          </p>

          <div className="mt-2.5 border-t border-sio-border-base pt-2.5">
            <div className="eyebrow">Suggested Next Action</div>
            <p className="mt-1 line-clamp-2 break-words text-pretty text-label-13 text-sio-fg-base">
              {isNeonStub || !signal.suggestedAction
                ? "Unavailable — local detection join missing."
                : signal.suggestedAction}
            </p>
            <p className="mt-0.5 text-label-12 text-sio-fg-muted">
              Display-only — not sent by Sioona.
            </p>
          </div>

          <div className="mt-2.5 border-t border-sio-border-base pt-2.5">
            <div className="eyebrow">Why This Fired</div>
            {evidenceItems.length > 0 ? (
              <ul className="mt-1 space-y-1.5">
                {evidenceItems.map((item) => {
                  const { kind, text } = formatEvidenceItem(item);
                  return (
                    <li key={item} className="min-w-0 text-label-13">
                      {kind === "quote" ? (
                        <blockquote className="line-clamp-2 break-words border-l-2 border-sio-border-base pl-2.5 text-pretty text-sio-fg-base">
                          “{text}”
                        </blockquote>
                      ) : (
                        <span className="line-clamp-2 break-words text-sio-fg-muted">
                          {text}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-label-13 text-sio-fg-muted">
                No local evidence
                {isNeonStub
                  ? " — this Neon stub has no joined JSON signal."
                  : "."}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <FeedbackControls signal={signal} />
        </div>

        {conversation ? (
          <div className="shrink-0 pb-1">
            <GroundTruthControl
              conversationId={conversation.id}
              groundTruth={conversation.groundTruth}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
