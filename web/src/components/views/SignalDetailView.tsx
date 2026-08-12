import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { FeedbackControls } from "@/components/FeedbackControls";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalQueueRow } from "@/components/SignalQueueRow";
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
          className="status-banner status-banner-warning flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2"
          role="status"
        >
          <p className="min-w-0 flex-1 text-pretty text-label-13 text-sio-fg-base">
            No local conversation to join — evidence and transcript unavailable.
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Link
              href={viewHref("upload")}
              className="btn-secondary h-8 min-h-8 px-2.5 text-label-13 md:h-8"
            >
              Upload Chats
            </Link>
            <ReDetectButton className="h-8 min-h-8 px-2.5 text-label-13 md:h-8" />
          </div>
        </div>
      ) : null}

      <div className="scroll-region flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-sio-border-base bg-sio-bg-base">
          <SignalQueueRow signal={signal} customerName={who} />

          <div className="grid border-t border-sio-border-base sm:grid-cols-2 sm:divide-x sm:divide-sio-border-base">
            <section className="min-w-0 px-3 py-2.5 sm:px-3.5">
              <h3 className="text-label-12 font-semibold text-sio-fg-base">
                Suggested Next Action
              </h3>
              <p className="mt-1 line-clamp-2 break-words text-pretty text-copy-14 text-sio-fg-base">
                {isNeonStub || !signal.suggestedAction
                  ? "Unavailable — local detection join missing."
                  : signal.suggestedAction}
              </p>
              <p className="mt-0.5 text-label-12 text-sio-fg-muted">
                Display-only — not sent by Sioona.
              </p>
            </section>

            <section className="min-w-0 border-t border-sio-border-base px-3 py-2.5 sm:border-t-0 sm:px-3.5">
              <h3 className="text-label-12 font-semibold text-sio-fg-base">
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
                  No local evidence
                  {isNeonStub
                    ? " — this Neon stub has no joined JSON signal."
                    : "."}
                </p>
              )}
            </section>
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
