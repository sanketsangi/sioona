"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useEffect, useId, useRef } from "react";
import { conversationMessageDomId } from "@/components/ConversationMessages";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { SignalStatus } from "@/components/SignalStatus";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  const inner = (
    <>
      {kindLabel ? (
        <span className="shrink-0 text-sio-fg-muted">{kindLabel}</span>
      ) : null}
      <span className="min-w-0 break-words text-sio-fg-base" translate="no">
        {value}
      </span>
    </>
  );

  if (onSelect && controlsId) {
    return (
      <Button
        type="button"
        variant="outline"
        size="xs"
        className={cn(
          "h-auto max-w-full gap-1.5 px-2 py-1 text-left text-label-12 font-normal whitespace-normal",
          "min-h-11 touch-manipulation lg:min-h-6",
          active && "border-sio-border-strong bg-sio-bg-interactive",
        )}
        aria-pressed={active}
        aria-controls={controlsId}
        aria-label={`Show in conversation: ${value}`}
        onClick={onSelect}
      >
        {inner}
      </Button>
    );
  }

  return (
    <Badge
      variant="outline"
      className="h-auto max-w-full gap-1.5 rounded-md px-2 py-1 text-left text-label-12 font-normal whitespace-normal"
    >
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
  const quoteBody = (
    <blockquote className="border-l-2 border-sio-border-strong pl-3 text-left">
      <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
        “{text}”
      </p>
    </blockquote>
  );
  const surface = cn(
    "h-auto w-full rounded-[var(--radius-control)] border border-border bg-sio-bg-base px-3 py-2 text-left font-normal whitespace-normal",
    active && "border-sio-border-strong bg-sio-bg-interactive",
  );

  if (onSelect && controlsId) {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(
          surface,
          "min-h-11 justify-start touch-manipulation transition-colors duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive lg:min-h-9",
        )}
        aria-pressed={active}
        aria-controls={controlsId}
        aria-label={`Show in conversation: ${text}`}
        onClick={onSelect}
      >
        {quoteBody}
      </Button>
    );
  }

  return <div className={surface}>{quoteBody}</div>;
}

function SupportHeading({
  id,
  children,
}: {
  id: string;
  children: string;
}) {
  return (
    <Label
      id={id}
      className="text-label-12 leading-5 font-medium tracking-normal text-sio-fg-subtle"
    >
      {children}
    </Label>
  );
}

/**
 * Suggested Next Action + Why This Fired + Matched — single Card well.
 * Header matches Feedback / Ground Truth (`InsightsReviewPaneHeader`).
 * Status chip, or Mark as Acted on Correct-not-Acted (A / Enter walk).
 * Quotes and match chips that join a stored message jump the transcript.
 * Neon stubs / missing join stay honest.
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
      <InsightsReviewPaneHeader id={headingId} title="Suggested Next Action">
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
      </InsightsReviewPaneHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-0">
        <div
          className={cn(
            evalCardPadClassName,
            "flex min-w-0 flex-col justify-center gap-1.5 py-3",
          )}
        >
          {isActed ? (
            <p className="text-label-12 leading-5 text-sio-fg-muted">
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
            <p className="text-label-12 leading-5 text-sio-status-danger-fg" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {showSupport ? (
          <>
            <Separator className="bg-sio-border-base" />
            <div
              className={cn(
                evalCardPadClassName,
                "flex min-w-0 flex-col gap-3 py-3",
              )}
            >
              {showWhy ? (
                <section
                  aria-labelledby={whyId}
                  className="flex min-w-0 flex-col gap-1.5"
                >
                  <SupportHeading id={whyId}>Why This Fired</SupportHeading>

                  {quotes.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
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
                    <p className="break-words text-pretty text-copy-14 leading-5 text-sio-fg-muted">
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
                <section
                  aria-labelledby={matchedId}
                  className="flex min-w-0 flex-col gap-1.5"
                >
                  <SupportHeading id={matchedId}>Matched</SupportHeading>
                  <ul className="flex flex-wrap gap-1.5">
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
