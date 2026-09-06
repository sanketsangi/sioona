"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { conversationMessageDomId } from "@/components/ConversationMessages";
import { CheckCircleIcon } from "@/components/icons/CheckCircleIcon";
import { CopyIcon } from "@/components/icons/CopyIcon";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
import {
  RetentionEmailAction,
  resolveRetentionEmailAction,
  RETENTION_EMAIL_STATUS_CHIP,
  RETENTION_EMAIL_STATUS_LABEL,
} from "@/components/RetentionEmailAction";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { resolveSuggestedAction } from "@/lib/suggested-action-display";
import type { Message, Signal, SupervisedAction } from "@/lib/types";
import { useMarkActed, type MarkActedWalk } from "@/lib/use-mark-acted";
import { cn } from "@/lib/utils";

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  messages?: Message[];
  customerName?: string;
  focusedMessageId?: string | null;
  onFocusMessage?: (messageId: string) => void;
  /** Follow-up Act queue walk — when set, rail shows primary Mark as Acted. */
  actedWalk?: MarkActedWalk | null;
  /** Stored supervised retention email draft, when one exists. */
  supervisedAction?: SupervisedAction | null;
  /**
   * When true, reply draft is not ready — skeleton + Copy / Mark as Acted
   * disabled (no stale draft). Parents omit this once the join is settled.
   */
  draftLoading?: boolean;
  className?: string;
};

/** Honest empty — never show a previous review’s draft. */
export const NO_RECOMMENDED_REPLY = "No recommended reply";

/** ≤2 quote lines in Why This Fired (UI_DESIGN). */
const MAX_WHY_QUOTES = 2;

const ACTED_TOOLTIP =
  "You run this in your tools — Sioona never sends or CRM-tags.";

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
  const interactive = Boolean(onSelect && controlsId);
  const label = (
    <span className="flex min-w-0 flex-row items-center gap-1 font-medium whitespace-nowrap">
      {kindLabel ? (
        <span className="shrink-0 font-normal text-sio-fg-subtle opacity-80 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100">
          {kindLabel}
        </span>
      ) : null}
      <span
        className="min-w-0 truncate text-sio-fg-subtle transition-colors duration-150 motion-reduce:transition-none group-hover:text-sio-fg-base"
        translate="no"
      >
        {value}
      </span>
    </span>
  );
  const body = (
    <>
      <div
        className={cn(
          "absolute inset-0 rounded-[10ex] bg-transparent outline-1 outline-offset-0 outline-dashed outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)] transition-colors duration-150 motion-reduce:transition-none",
          active && "bg-sio-bg-muted outline-sio-border-strong",
          interactive &&
            "group-hover:bg-sio-bg-interactive group-hover/trigger:bg-sio-bg-base group-hover/trigger:outline-transparent group-focus-visible/trigger:bg-sio-bg-base group-focus-visible/trigger:outline-transparent",
        )}
        data-pill-background="true"
        aria-hidden
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[10ex] outline-1 outline-offset-0 [outline-style:solid] outline-transparent transition-colors duration-150 motion-reduce:transition-none",
            interactive &&
              "group-hover/trigger:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)] group-focus-visible/trigger:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)]",
          )}
        />
      </div>
      <div
        className={cn(
          "relative flex h-8 max-w-full flex-row items-center gap-1.5 rounded-[10ex] px-3 text-label-14",
          interactive && "cursor-pointer",
        )}
      >
        {label}
      </div>
    </>
  );

  if (interactive) {
    return (
      <div className="group relative max-w-full">
        <button
          type="button"
          data-slot="button"
          className="group/trigger relative h-8 max-w-full cursor-pointer rounded-[10ex] touch-manipulation outline-none select-none !ring-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] focus-visible:shadow-[var(--focus-ring)] md:before:hidden"
          aria-pressed={active}
          aria-controls={controlsId ?? undefined}
          aria-label={`Show in conversation: ${value}`}
          onClick={onSelect ?? undefined}
        >
          {body}
        </button>
      </div>
    );
  }

  return (
    <div className="group relative max-w-full">
      <div className="relative h-8 max-w-full rounded-[10ex]">{body}</div>
    </div>
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
    <span className="flex min-w-0 items-center gap-2">
      <CheckCircleIcon className="size-4 shrink-0 text-sio-fg-subtle" />
      <span className="min-w-0 truncate text-copy-14 leading-5 text-sio-fg-base">
        “{text}”
      </span>
    </span>
  );
  const surface = cn(
    "h-9 w-full rounded-[var(--radius-control)] border border-border bg-sio-bg-base px-3 text-left font-normal",
    active && "evidence-highlight border-transparent bg-sio-bg-interactive",
  );

  if (onSelect && controlsId) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={cn(
          surface,
          // Visual chrome stays h-9; expand hit ≥44px on mobile without taller chrome.
          "relative justify-start touch-manipulation transition-[color,background-color,border-color,box-shadow] duration-150 before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] md:before:hidden",
          active
            ? "hover:border-transparent hover:bg-sio-bg-interactive"
            : "hover:border-sio-border-strong hover:bg-sio-bg-interactive",
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

function SupportHeading({ id, children }: { id: string; children: string }) {
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
 * Recommended Actions + Why This Fired + Matched + Retention Email.
 * Distinct Actions well under Feedback (`data-review-slot="actions"`).
 * Footer: Copy Reply (secondary) + Mark as Acted (primary only on Correct
 * ¬acted) — below Retention Email when present, else below the reply draft.
 * Soft nudge when Feedback is missing or not Correct — gate dialog
 * still sends operators to Feedback; Incorrect / Partial are not hard-blocked
 * beyond that. Empty = “No recommended reply”; loading = skeleton + both CTAs
 * disabled. Copy / Acted errors stay inline and recoverable. Retention Email
 * nests inside Actions; Why is a sibling well.
 */
export function SignalReviewSuggestedAction({
  signal,
  messages = [],
  customerName = "",
  focusedMessageId = null,
  onFocusMessage,
  actedWalk = null,
  supervisedAction = null,
  draftLoading = false,
  className,
}: SignalReviewSuggestedActionProps) {
  const headingId = useId();
  const whyId = useId();
  const matchedId = useId();
  const replyLabelId = useId();
  const copyStatusId = useId();
  const sectionRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const walk = actedWalk ?? {};
  const { actedPending, canMarkActed, error, hasFeedback, isActed, setActed } =
    useMarkActed(signal, walk);
  // While loading, never paint a prior draft — skeleton only.
  const actionText = draftLoading
    ? ""
    : resolveSuggestedAction({
        type: signal.type,
        customerName,
        evidence: signal.evidence,
        fallback: signal.suggestedAction,
      });
  const missingAction = !draftLoading && !actionText;
  const draftReady = !draftLoading && Boolean(actionText);
  const actionsBusy = draftLoading || actedPending;
  /** Primary only on Correct ¬acted — makes the Correct-path Acted CTA obvious. */
  const actedIsPrimary = canMarkActed || isActed;
  const isNeonStub = isNeonStubSignalId(signal.id);
  const giveFeedbackRef = useRef<HTMLButtonElement>(null);
  const [feedbackGateOpen, setFeedbackGateOpen] = useState(false);

  const requestMarkActed = useCallback(() => {
    if (isActed || actedPending || draftLoading) return;
    if (canMarkActed) {
      void setActed(true);
      return;
    }
    setFeedbackGateOpen(true);
  }, [actedPending, canMarkActed, draftLoading, isActed, setActed]);

  // Drop Copied… / copy error when the review panel changes.
  useEffect(() => {
    setCopyState("idle");
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [signal.id]);

  function goToFeedback() {
    setFeedbackGateOpen(false);
    requestAnimationFrame(() => {
      const review = sectionRef.current?.closest("[id^='signal-review-body-']");
      const feedback = review?.querySelector<HTMLElement>(
        "[data-review-slot='feedback']",
      );
      const correct = feedback?.querySelector<HTMLButtonElement>(
        '[aria-keyshortcuts="C"]',
      );
      feedback?.scrollIntoView({ block: "nearest" });
      correct?.focus();
    });
  }

  useEffect(() => {
    if (isActed || draftLoading) return;
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
      requestMarkActed();
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [actedPending, draftLoading, isActed, requestMarkActed]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function copyReply() {
    if (!draftReady) return;
    const text = actionText;
    const markCopied = () => {
      setCopyState("copied");
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(
        () => setCopyState("idle"),
        2000,
      );
    };
    const markError = () => {
      setCopyState("error");
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(
        () => setCopyState("idle"),
        2500,
      );
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      markCopied();
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
        markCopied();
      } catch {
        markError();
      }
    }
  }

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

  const wellClass = cn("insights-review-pane", evalCardClassName, className);

  const retentionEmail = resolveRetentionEmailAction(
    signal,
    customerName,
    supervisedAction,
  );
  const retentionStatusChip = retentionEmail ? (
    <InsightsReviewStatusChip
      className={RETENTION_EMAIL_STATUS_CHIP[retentionEmail.status]}
    >
      {RETENTION_EMAIL_STATUS_LABEL[retentionEmail.status]}
    </InsightsReviewStatusChip>
  ) : null;

  const replyActionsToolbar = (
    <div
      className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2"
      data-review-actions-toolbar="true"
      role="group"
      aria-label="Reply actions"
    >
      <Button
        type="button"
        variant="outline"
        data-copied={copyState === "copied" ? "true" : undefined}
        className={cn("btn-secondary shrink-0 active:translate-y-0")}
        disabled={!draftReady}
        aria-label="Copy reply to clipboard"
        aria-describedby={copyStatusId}
        onClick={() => void copyReply()}
      >
        {/* shadcn-style icon swap — same grid cell so width/height stay fixed */}
        <span
          className="relative inline-grid size-3.5 shrink-0 place-items-center"
          aria-hidden
        >
          <CopyIcon
            className={cn(
              "col-start-1 row-start-1 size-3.5 transition-[transform,opacity] duration-150 motion-reduce:transition-none",
              copyState === "copied"
                ? "scale-0 opacity-0"
                : "scale-100 opacity-100",
            )}
          />
          <Check
            className={cn(
              "col-start-1 row-start-1 size-3.5 transition-[transform,opacity] duration-150 motion-reduce:transition-none",
              copyState === "copied"
                ? "scale-100 opacity-100"
                : "scale-0 opacity-0",
            )}
            weight="bold"
          />
        </span>
        {/* Stack labels so “Copied…” never shrinks past “Copy Reply”; center the shorter label. */}
        <span className="relative inline-grid justify-items-center text-center">
          <span
            className={cn(
              "col-start-1 row-start-1 transition-opacity duration-150 motion-reduce:transition-none",
              copyState === "copied" ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={copyState !== "copied"}
          >
            Copied…
          </span>
          <span
            className={cn(
              "col-start-1 row-start-1 transition-opacity duration-150 motion-reduce:transition-none",
              copyState === "copied" ? "opacity-0" : "opacity-100",
            )}
            aria-hidden={copyState === "copied"}
          >
            Copy Reply
          </span>
        </span>
      </Button>
      {isActed ? (
        <Button
          type="button"
          className="btn-primary shrink-0 disabled:opacity-100"
          disabled
          aria-pressed="true"
          aria-label="Marked as Acted"
        >
          <Check className="size-3.5 shrink-0" weight="bold" aria-hidden />
          Marked as Acted
        </Button>
      ) : (
        <Dialog open={feedbackGateOpen} onOpenChange={setFeedbackGateOpen}>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0">
                  <Button
                    type="button"
                    variant={actedIsPrimary ? "default" : "outline"}
                    className={cn(
                      actedIsPrimary ? "btn-primary" : "btn-secondary",
                      "shrink-0",
                    )}
                    disabled={actionsBusy}
                    aria-busy={actedPending}
                    aria-haspopup={canMarkActed ? undefined : "dialog"}
                    aria-keyshortcuts="A Enter"
                    aria-label="Mark as Acted"
                    onClick={requestMarkActed}
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
          <DialogContent
            className="overscroll-contain motion-reduce:animate-none"
            showCloseButton
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              giveFeedbackRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {hasFeedback
                  ? "Correct Feedback Required"
                  : "Give Feedback First"}
              </DialogTitle>
              <DialogDescription>
                {hasFeedback
                  ? "Mark as Acted is only for Correct reviews. Update Feedback to Correct, then try again. You run the step in your tools — Sioona never sends or CRM-tags."
                  : "Choose Correct, Incorrect, or Partially Correct in Feedback first. Mark as Acted records that you handled a Correct review. You execute outside — Sioona never sends or CRM-tags."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="btn-secondary"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                ref={giveFeedbackRef}
                type="button"
                className="btn-primary"
                onClick={goToFeedback}
              >
                Give Feedback
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  return (
    <>
      <Card
        ref={sectionRef}
        size="sm"
        data-review-slot="actions"
        className={wellClass}
        aria-labelledby={headingId}
      >
        <InsightsReviewPaneHeader id={headingId} title="Recommended Actions">
          {retentionStatusChip}
        </InsightsReviewPaneHeader>

        <CardContent className="flex min-w-0 flex-col px-0">
          <div
            className={cn(
              evalCardPadClassName,
              "flex min-w-0 flex-col justify-center gap-1.5 py-3",
            )}
          >
            {draftLoading || isActed ? null : !hasFeedback ? (
              <p className="text-label-12 leading-5 text-sio-fg-muted">
                Label in Feedback first — needed for this week’s ≥80% score.
                Mark as Acted stays a draft; nothing is sent.
              </p>
            ) : !canMarkActed ? (
              <p className="text-label-12 leading-5 text-sio-fg-muted">
                Update Feedback to Correct to unlock Mark as Acted — nothing is
                sent.
              </p>
            ) : null}
            <span id={replyLabelId} className="sr-only">
              Recommended reply
            </span>
            {draftLoading ? (
              <div
                className="flex min-w-0 flex-col gap-2"
                data-review-reply-skeleton="true"
                aria-busy="true"
                aria-label="Loading recommended reply"
              >
                <Skeleton className="h-4 w-full max-w-[28rem]" />
                <Skeleton className="h-4 w-[88%] max-w-[24rem]" />
                <Skeleton className="h-4 w-[72%] max-w-[20rem]" />
              </div>
            ) : (
              <p
                aria-labelledby={replyLabelId}
                className={
                  "break-words text-pretty text-copy-16 " +
                  (missingAction ? "text-sio-fg-muted" : "text-sio-fg-base")
                }
              >
                {missingAction ? NO_RECOMMENDED_REPLY : actionText}
              </p>
            )}
            <p id={copyStatusId} className="sr-only" aria-live="polite">
              {copyState === "copied"
                ? "Reply copied to clipboard. Paste it in your tools — Sioona never sends."
                : copyState === "error"
                  ? "Could not copy reply. Try again."
                  : null}
            </p>
            {copyState === "error" ? (
              <p
                className="text-label-12 leading-5 text-sio-status-danger-fg"
                role="alert"
              >
                Could not copy. Try again.
              </p>
            ) : null}
            {error ? (
              <p
                className="text-label-12 leading-5 text-sio-status-danger-fg"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>

          <RetentionEmailAction
            embedded
            // Why This Fired already owns quote evidence — avoid a second copy.
            omitEvidence={showWhy && quotes.length > 0}
            signal={signal}
            customerName={customerName}
            action={supervisedAction}
          />

          <div
            className={cn(
              evalCardPadClassName,
              "flex min-w-0 flex-col gap-1.5 pb-3 pt-0",
            )}
            data-review-actions-footer="true"
          >
            {replyActionsToolbar}
          </div>
        </CardContent>
      </Card>
      {showSupport ? (
        <Card
          size="sm"
          data-review-slot="why"
          className={wellClass}
          aria-labelledby={showWhy ? whyId : matchedId}
        >
          <InsightsReviewPaneHeader
            id={showWhy ? whyId : matchedId}
            title={showWhy ? "Why This Fired" : "Matched"}
          />
          <CardContent className="flex min-w-0 flex-col px-0">
            <div
              className={cn(
                evalCardPadClassName,
                "flex min-w-0 flex-col gap-3 py-3",
              )}
            >
              {showWhy ? (
                <section
                  aria-labelledby={whyId}
                  className="flex min-w-0 flex-col gap-2"
                >
                  {quotes.length > 0 ? (
                    <ul className="flex flex-col gap-3">
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
                  {showWhy ? (
                    <SupportHeading id={matchedId}>Matched</SupportHeading>
                  ) : null}
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
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
