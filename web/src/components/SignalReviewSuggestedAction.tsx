"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useEffect, useId, useRef } from "react";
import { conversationMessageDomId } from "@/components/ConversationMessages";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { SignalStatus } from "@/components/SignalStatus";
import {
  evalCardClassName,
  evalCardHeaderClassName,
  evalCardPadClassName,
} from "@/components/EvalCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

function WhyQuote({
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
  const quote = (
    <blockquote className="border-l-2 border-sio-border-strong pl-3">
      <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
        “{text}”
      </p>
    </blockquote>
  );
  const surface = cn(
    "w-full rounded-[var(--radius-control)] border px-3 py-2 text-left",
    active
      ? "border-sio-border-strong bg-sio-bg-interactive"
      : "border-sio-border-subtle bg-sio-bg-base",
  );

  if (onSelect && controlsId) {
    return (
      <button
        type="button"
        className={cn(
          surface,
          "min-h-11 touch-manipulation transition-colors duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive lg:min-h-9",
        )}
        aria-pressed={active}
        aria-controls={controlsId}
        aria-label={`Show in conversation: ${text}`}
        onClick={onSelect}
      >
        {quote}
      </button>
    );
  }

  return <div className={surface}>{quote}</div>;
}

function SupportHeading({
  id,
  children,
}: {
  id: string;
  children: string;
}) {
  return (
    <h4
      id={id}
      className="text-label-12 font-medium tracking-normal text-sio-fg-subtle"
    >
      {children}
    </h4>
  );
}

/**
 * Suggested Next Action + Why This Fired + Matched — single Card well.
 * Header matches Conversation / Feedback (`evalCardHeader` flex baseline).
 * Mark as Acted on Correct-not-Acted (A / Enter walk). Quotes and match
 * chips that join a stored message jump the transcript. Neon stubs /
 * missing join stay honest.
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
  const sectionRef = useRef<HTMLDivElement>(null);
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

  const showWhy = quotes.length > 0 || matches.length === 0;
  const showMatched = matches.length > 0;
  const showSupport = showWhy || showMatched;

  return (
    <Card
      ref={sectionRef}
      size="sm"
      data-review-slot="why"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <CardHeader
        className={cn(evalCardHeaderClassName, "[.border-b]:pb-2.5")}
      >
        <CardTitle className="contents p-0 text-sm leading-5 font-semibold">
          <h3
            id={headingId}
            className="min-w-0 flex-1 truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
          >
            Suggested Next Action
          </h3>
        </CardTitle>
        <CardAction className="col-auto row-span-1 row-start-auto flex shrink-0 items-center self-center justify-self-auto">
          {showRailActed ? (
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0">
                    <Button
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
                    </Button>
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
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-0">
        <div className={cn(evalCardPadClassName, "flex min-w-0 flex-col gap-1.5 pt-3")}>
          {isActed ? (
            <p className="text-label-12 text-sio-fg-muted">
              Marked as Acted — not sent.
            </p>
          ) : null}
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

        {showSupport ? (
          <>
            <Separator className="bg-sio-border-base" />
            <div className={cn(evalCardPadClassName, "flex min-w-0 flex-col gap-4 pb-3")}>
              {showWhy ? (
                <section aria-labelledby={whyId} className="min-w-0">
                  <SupportHeading id={whyId}>Why This Fired</SupportHeading>

                  {quotes.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-2">
                      {quotes.map(({ item, text, messageId }) => {
                        const canJump = Boolean(messageId && onFocusMessage);
                        return (
                          <li key={item} className="min-w-0">
                            <WhyQuote
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
                                canJump && messageId
                                  ? () => onFocusMessage?.(messageId)
                                  : null
                              }
                            />
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

              {showWhy && showMatched ? (
                <Separator className="bg-sio-border-base" />
              ) : null}

              {showMatched ? (
                <section aria-labelledby={matchedId} className="min-w-0">
                  <SupportHeading id={matchedId}>Matched</SupportHeading>
                  <ul className="mt-2 flex flex-wrap gap-2">
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
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
