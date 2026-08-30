"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useEffect, useId, useRef } from "react";
import { conversationMessageDomId } from "@/components/ConversationMessages";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { SignalStatus } from "@/components/SignalStatus";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { messageIdForEvidence } from "@/lib/evidence-messages";
import { formatEvidenceItem } from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import {
  isActedEnterBlockedTarget,
  isEditableShortcutTarget,
  isMarkActedShortcutKey,
} from "@/lib/review-triage";
import type { Message, Signal } from "@/lib/types";
import {
  useMarkActed,
  type MarkActedWalk,
} from "@/lib/use-mark-acted";
import { cn } from "@/lib/utils";

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  messages?: Message[];
  focusedMessageId?: string | null;
  onFocusMessage?: (messageId: string) => void;
  /** Follow-up Act queue walk — when set, rail shows primary Mark as Acted. */
  actedWalk?: MarkActedWalk | null;
  className?: string;
};

/** ≤2 quote lines in Why This Fired (UI_DESIGN). */
const MAX_WHY_QUOTES = 2;

const ACTED_TOOLTIP = "Does not send the suggested action.";

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
    "h-auto max-w-full gap-1.5 rounded-[var(--radius-control)] border-sio-border-subtle bg-sio-bg-base px-2 py-1 text-left text-label-12 font-normal whitespace-normal",
    active && "border-sio-border-strong bg-sio-bg-interactive",
    onSelect &&
      "min-h-11 cursor-pointer touch-manipulation transition-colors duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive lg:min-h-8",
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
        className={cn("inline-flex max-w-full items-baseline", chipClass)}
        aria-pressed={active}
        aria-controls={controlsId}
        aria-label={`Show in conversation: ${value}`}
        onClick={onSelect}
      >
        {inner}
      </button>
    );
  }

  return (
    <Badge variant="outline" className={chipClass}>
      {inner}
    </Badge>
  );
}

/**
 * Suggested Next Action + Why This Fired + Matched — single review well.
 * Header is the status chip, or Mark as Acted on Correct-not-Acted
 * (A / Enter walk). Quotes and match chips that join a stored message
 * jump the transcript. Neon stubs / missing join stay honest.
 */
export function SignalReviewSuggestedAction({
  signal,
  messages = [],
  focusedMessageId = null,
  onFocusMessage,
  actedWalk = null,
  className,
}: SignalReviewSuggestedActionProps) {
  const headingId = useId();
  const whyId = useId();
  const matchedId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const walk = actedWalk ?? {};
  const { actedPending, canMarkActed, error, isActed, setActed } = useMarkActed(
    signal,
    walk,
  );
  const missingAction = !signal.suggestedAction;
  const isNeonStub = isNeonStubSignalId(signal.id);
  const showRailActed = actedWalk != null && canMarkActed;

  useEffect(() => {
    if (!showRailActed) return;
    const keyboardRoot =
      sectionRef.current?.closest("[data-review-keyboard-root]") ??
      sectionRef.current;
    if (!keyboardRoot) return;
    const el: Element = keyboardRoot;

    const onKeyDown = (e: Event) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (actedPending || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!el.contains(e.target as Node)) return;
      if (isEditableShortcutTarget(e.target)) return;
      if (!isMarkActedShortcutKey(e.key)) return;
      // Enter on Feedback / other buttons activates that control, not Acted.
      if (e.key === "Enter" && isActedEnterBlockedTarget(e.target)) return;
      e.preventDefault();
      void setActed(true);
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [actedPending, setActed, showRailActed]);

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

  return (
    <section
      ref={sectionRef}
      data-review-slot="why"
      className={cn("insights-review-pane", className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title="Suggested Next Action">
        {showRailActed ? (
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0">
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={actedPending}
                    aria-busy={actedPending}
                    aria-keyshortcuts="A Enter"
                    onClick={() => void setActed(true)}
                  >
                    {actedPending ? (
                      <ButtonSpinner />
                    ) : (
                      <Check
                        className="size-3.5 shrink-0"
                        weight="bold"
                        aria-hidden
                      />
                    )}
                    Mark as Acted
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                {ACTED_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <SignalStatus signal={signal} variant="chip" />
        )}
      </InsightsReviewPaneHeader>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-label-12 text-sio-fg-muted">
            {isActed
              ? "Marked as Acted — not sent."
              : "Display only — not sent."}
          </p>
          <p
            className={
              "text-heading-16 break-words text-pretty font-semibold leading-6 tracking-normal " +
              (missingAction ? "text-sio-fg-muted" : "text-sio-fg-base")
            }
          >
            {missingAction
              ? "Unavailable — local detection join missing."
              : signal.suggestedAction}
          </p>
          {showRailActed && error ? (
            <p className="text-label-12 text-sio-status-danger-fg" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {quotes.length > 0 || matches.length === 0 ? (
          <section aria-labelledby={whyId} className="min-w-0">
            <h4
              id={whyId}
              className="text-label-13 font-semibold tracking-normal text-sio-fg-base"
            >
              Why This Fired
            </h4>

            {quotes.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-2">
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
                            "w-full min-h-11 rounded-md border px-2 py-1.5 text-left touch-manipulation transition-colors duration-150",
                            active
                              ? "border-sio-border-strong bg-sio-bg-interactive"
                              : "border-transparent hover:border-sio-border-subtle hover:bg-sio-bg-interactive",
                          )}
                          aria-pressed={active}
                          aria-controls={conversationMessageDomId(messageId)}
                          aria-label={`Show in conversation: ${text}`}
                          onClick={() => onFocusMessage?.(messageId)}
                        >
                          <blockquote className="border-l-2 border-sio-border-strong pl-3">
                            <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
                              “{text}”
                            </p>
                          </blockquote>
                        </button>
                      ) : (
                        <blockquote className="border-l-2 border-sio-border-strong pl-3">
                          <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
                            “{text}”
                          </p>
                        </blockquote>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 break-words text-pretty text-copy-14 text-sio-fg-muted">
                {isNeonStub
                  ? "No local evidence — detection join missing."
                  : "No local evidence."}
              </p>
            )}
          </section>
        ) : null}

        {matches.length > 0 ? (
          <section aria-labelledby={matchedId} className="min-w-0">
            <h4
              id={matchedId}
              className="text-label-13 font-semibold tracking-normal text-sio-fg-base"
            >
              Matched
            </h4>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
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
          </section>
        ) : null}
      </div>
    </section>
  );
}
