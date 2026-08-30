"use client";

import { useId } from "react";
import { conversationMessageDomId } from "@/components/ConversationMessages";
import { messageIdForEvidence } from "@/lib/evidence-messages";
import { formatEvidenceItem } from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import type { Message, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  messages?: Message[];
  focusedMessageId?: string | null;
  onFocusMessage?: (messageId: string) => void;
  className?: string;
};

/** ≤2 quote lines in Why This Fired (UI_DESIGN). */
const MAX_WHY_QUOTES = 2;

function EvidenceChip({
  text,
  active,
  controlsId,
  onSelect,
}: {
  text: string;
  active: boolean;
  controlsId: string | null;
  onSelect: (() => void) | null;
}) {
  const sep = text.indexOf(" · ");
  const kindLabel = sep > 0 ? text.slice(0, sep) : null;
  const value = sep > 0 ? text.slice(sep + 3) : text;
  const chipClass = cn(
    "inline-flex max-w-full items-baseline gap-1.5 rounded-md border px-2 py-1 text-left text-label-12 shadow-[0_0_0_1px_rgba(0,0,0,0.02)]",
    active
      ? "border-sio-border-strong bg-sio-bg-interactive"
      : "border-sio-border-subtle bg-sio-bg-base",
    onSelect &&
      "min-h-11 cursor-pointer touch-manipulation transition-colors duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive md:min-h-8",
  );
  const inner = (
    <>
      {kindLabel ? (
        <span className="shrink-0 font-medium text-sio-fg-muted">
          {kindLabel}
        </span>
      ) : null}
      <span
        className="min-w-0 break-words font-medium text-sio-fg-base"
        translate="no"
      >
        {value}
      </span>
    </>
  );

  if (onSelect && controlsId) {
    return (
      <button
        type="button"
        className={chipClass}
        aria-pressed={active}
        aria-controls={controlsId}
        aria-label={`Show in conversation: ${value}`}
        onClick={onSelect}
      >
        {inner}
      </button>
    );
  }

  return <span className={chipClass}>{inner}</span>;
}

/**
 * Suggested Next Action + Why This Fired — display-only metric-strip.
 * Quotes / match chips that join a stored message jump the transcript.
 * Neon stubs / missing join show honest empty copy.
 */
export function SignalReviewSuggestedAction({
  signal,
  messages = [],
  focusedMessageId = null,
  onFocusMessage,
  className,
}: SignalReviewSuggestedActionProps) {
  const headingId = useId();
  const whyId = useId();
  const isActed = signal.status === "acted";
  const missingAction = !signal.suggestedAction;
  const isNeonStub = isNeonStubSignalId(signal.id);

  const formatted = signal.evidence.map((item) => ({
    item,
    messageId: messageIdForEvidence(item, messages),
    ...formatEvidenceItem(item),
  }));
  const quotes = formatted
    .filter((entry) => entry.kind === "quote")
    .slice(0, MAX_WHY_QUOTES);
  const matches = formatted.filter(
    (entry) => entry.kind === "match" || entry.kind === "suppressed",
  );
  const hasEvidence = quotes.length > 0 || matches.length > 0;

  return (
    <section
      data-review-slot="why"
      className={cn("insights-review-pane", className)}
      aria-labelledby={headingId}
    >
      <div className="border-b border-sio-border-base px-3 py-2">
        <h3
          id={headingId}
          className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
        >
          Suggested Next Action
        </h3>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 px-3 py-3">
        {isActed ? (
          <p className="text-pretty text-label-13 text-sio-fg-muted">
            Marked as Acted — not sent.
          </p>
        ) : null}
        <p
          className={cn(
            "break-words text-pretty text-copy-14 font-medium leading-5",
            missingAction ? "text-sio-fg-muted" : "text-sio-fg-base",
          )}
        >
          {missingAction
            ? "Unavailable — local detection join missing."
            : signal.suggestedAction}
        </p>

        <section aria-labelledby={whyId}>
          <h4
            id={whyId}
            className="text-label-13 font-semibold tracking-normal text-sio-fg-base"
          >
            Why This Fired
          </h4>

          {hasEvidence ? (
            <div className="mt-2.5 flex flex-col gap-2.5">
              {quotes.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {quotes.map(({ item, text, messageId }) => {
                    const canJump = Boolean(messageId && onFocusMessage);
                    const active = Boolean(
                      messageId && messageId === focusedMessageId,
                    );
                    return (
                      <li key={item} className="min-w-0">
                        {canJump && messageId ? (
                          <button
                            type="button"
                            className={cn(
                              "w-full min-h-11 rounded-md border px-0 py-1 text-left touch-manipulation transition-colors duration-150",
                              active
                                ? "border-sio-border-strong bg-sio-bg-interactive"
                                : "border-transparent hover:border-sio-border-subtle hover:bg-sio-bg-interactive",
                            )}
                            aria-pressed={active}
                            aria-controls={conversationMessageDomId(messageId)}
                            aria-label={`Show in conversation: ${text}`}
                            onClick={() => onFocusMessage?.(messageId)}
                          >
                            <blockquote className="border-l-2 border-sio-fg-base/20 pl-3">
                              <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
                                “{text}”
                              </p>
                            </blockquote>
                          </button>
                        ) : (
                          <blockquote className="border-l-2 border-sio-fg-base/20 pl-3">
                            <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
                              “{text}”
                            </p>
                          </blockquote>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {matches.length > 0 ? (
                <div className="min-w-0">
                  <p className="text-label-12 font-medium text-sio-fg-muted">
                    Matched
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {matches.map(({ item, text, messageId }) => (
                      <li key={item} className="min-w-0 max-w-full">
                        <EvidenceChip
                          text={text}
                          active={Boolean(
                            messageId && messageId === focusedMessageId,
                          )}
                          controlsId={
                            messageId
                              ? conversationMessageDomId(messageId)
                              : null
                          }
                          onSelect={
                            messageId && onFocusMessage
                              ? () => onFocusMessage(messageId)
                              : null
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 break-words text-pretty text-copy-14 text-sio-fg-muted">
              {isNeonStub
                ? "No local evidence — detection join missing."
                : "No local evidence."}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
