"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { conversationMessageDomId } from "@/components/ConversationMessages";
import { CheckCircleIcon } from "@/components/icons/CheckCircleIcon";
import { CopyIcon } from "@/components/icons/CopyIcon";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
import {
  RetentionEmailAction,
  editedRetentionDraftBody,
  resolveRetentionEmailAction,
  retentionHeaderChipStatus,
  RETENTION_EMAIL_STATUS_CHIP,
  RETENTION_EMAIL_STATUS_LABEL,
  type RetentionEmailDraftBody,
} from "@/components/RetentionEmailAction";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skiper45MorphConfirmation } from "@/components/v1/skiper45";
import { messageIdForEvidence } from "@/lib/evidence-messages";
import {
  evidenceQuotesForDisplay,
  suggestedActionFallback,
} from "@/lib/server-evidence";
import {
  evidenceMatchText,
  firedRuleKind,
  firedRuleSentence,
} from "@/lib/fired-rule";
import { formatEvidenceItem } from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import {
  isActedEnterBlockedTarget,
  isEditableShortcutTarget,
  isMarkActedShortcutKey,
} from "@/lib/review-triage";
import { resolveSuggestedAction } from "@/lib/suggested-action-display";
import type {
  Message,
  Signal,
  SupervisedAction,
  SupervisedActionStatus,
} from "@/lib/types";
import { useMarkActed, type MarkActedWalk } from "@/lib/use-mark-acted";
import { cn } from "@/lib/utils";

/**
 * Clipboard text for Copy Reply.
 * An edited retention body wins; otherwise the suggested-action reply.
 */
export function copyReplyClipboardText(
  suggestedAction: string,
  draft: RetentionEmailDraftBody | null,
): string {
  return editedRetentionDraftBody(draft) ?? suggestedAction;
}

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  messages?: Message[];
  customerName?: string;
  focusedMessageId?: string | null;
  onFocusMessage?: (messageId: string) => void;
  /** Follow-up Act queue walk — when set, rail shows primary Mark as acted. */
  actedWalk?: MarkActedWalk | null;
  /** Stored supervised retention email draft, when one exists. */
  supervisedAction?: SupervisedAction | null;
  /**
   * When true, reply draft is not ready — skeleton + Copy / Mark as acted
   * disabled (no stale draft). Parents omit this once the join is settled.
   */
  draftLoading?: boolean;
  /** Detection review follows its evidence and precedes draft decisions. */
  reviewControls?: ReactNode;
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
      <span className="min-w-0 whitespace-normal break-words text-copy-14 leading-5 text-sio-fg-base">
        “{text}”
      </span>
    </span>
  );
  const surface = cn(
    "min-h-11 h-auto w-full py-2 rounded-[var(--radius-control)] border border-border bg-sio-bg-base px-3 text-left font-normal",
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
          // Let long persisted quotes wrap while preserving a generous hit target.
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
 * Mark as acted: inside Retention Email bottom toolbar (with Edit Draft) when
 * that section is present; otherwise Actions footer. Copy Reply sits in the
 * Recommended Actions header beside the status chip. Soft nudge when Feedback
 * is missing or not Correct — gate morph still sends operators to Feedback;
 * Incorrect / Partial are not hard-blocked beyond that. Empty = “No
 * recommended reply”; loading = skeleton + both CTAs disabled. Copy / Acted
 * errors stay inline and recoverable. Retention Email nests inside Actions;
 * Why is a sibling well.
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
  reviewControls,
}: SignalReviewSuggestedActionProps) {
  const headingId = useId();
  const whyId = useId();
  const matchedId = useId();
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
        evidence: evidenceQuotesForDisplay(signal),
        fallback: suggestedActionFallback(signal),
      });
  const missingAction = !draftLoading && !actionText;
  const draftReady = !draftLoading && Boolean(actionText);
  const actionsBusy = draftLoading || actedPending;
  const isNeonStub = isNeonStubSignalId(signal.id);
  const giveFeedbackRef = useRef<HTMLButtonElement>(null);
  const feedbackGateTitleId = useId();
  const feedbackGateDescId = useId();
  const [feedbackGateOpen, setFeedbackGateOpen] = useState(false);
  const [copyPanelId, setCopyPanelId] = useState(signal.id);
  // Drop Copied… / copy error / open gate when the review panel changes.
  if (signal.id !== copyPanelId) {
    setCopyPanelId(signal.id);
    setCopyState("idle");
    setFeedbackGateOpen(false);
  } else if (canMarkActed && feedbackGateOpen) {
    // Correct unlocks Mark as acted — close the gate so Popover does not unmount open.
    setFeedbackGateOpen(false);
  }

  const requestMarkActed = useCallback(() => {
    if (isActed || actedPending || draftLoading) return;
    if (canMarkActed) {
      void setActed(true);
      return;
    }
    setFeedbackGateOpen(true);
  }, [actedPending, canMarkActed, draftLoading, isActed, setActed]);

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
        copyTimerRef.current = null;
      }
    };
  }, [signal.id]);

  async function copyReply() {
    if (!draftReady) return;
    const text = copyReplyClipboardText(actionText, retentionDraft);
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

  const serverAnchored =
    signal.evidenceStatus === "valid" ||
    signal.evidenceStatus === "stale" ||
    signal.evidenceStatus === "unresolved";
  let quoteIndex = 0;
  const formatted = signal.evidence.map((item) => {
    const kind = formatEvidenceItem(item).kind;
    const span =
      kind === "quote" && signal.evidenceStatus === "valid"
        ? signal.evidenceSpans?.[quoteIndex++]
        : undefined;
    return {
      item,
      messageId:
        (messages.some((message) => message.id === span?.messageId) ? span?.messageId : null) ??
        (serverAnchored ? null : messageIdForEvidence(item, messages)),
      kind,
      text: evidenceMatchText(item, signal.type),
    };
  });
  const ruleKind = firedRuleKind(
    signal.evidenceStatus === "stale" || signal.evidenceStatus === "unresolved"
      ? []
      : signal.evidence,
    signal.type,
  );
  const unavailableCopy =
    signal.evidenceStatus === "stale"
      ? "Source changed — re-run detection"
      : signal.evidenceStatus === "unresolved"
        ? "Re-run detection"
        : null;
  const quotes = unavailableCopy
    ? []
    : formatted
        .filter((entry) => entry.kind === "quote")
        .slice(0, MAX_WHY_QUOTES);
  const matches = unavailableCopy
    ? []
    : formatted.filter(
        (entry) => entry.kind === "match" || entry.kind === "suppressed",
      );

  const showWhy = quotes.length > 0 || matches.length === 0 || unavailableCopy !== null;
  const showMatched = matches.length > 0;
  const showSupport = showWhy || showMatched;

  const wellClass = cn("insights-review-pane", evalCardClassName, className);

  const retentionEmail = resolveRetentionEmailAction(
    signal,
    customerName,
    supervisedAction,
  );
  const resolvedDraft: RetentionEmailDraftBody | null = retentionEmail
    ? {
        body: retentionEmail.body,
        generatedBody: retentionEmail.generatedBody,
      }
    : null;
  const draftSyncKey = `${signal.id}\0${retentionEmail?.id ?? ""}\0${retentionEmail?.status ?? ""}\0${retentionEmail?.body ?? ""}\0${retentionEmail?.generatedBody ?? ""}`;
  const [liveRetentionDraft, setLiveRetentionDraft] =
    useState<RetentionEmailDraftBody | null>(null);
  const [prevDraftSyncKey, setPrevDraftSyncKey] = useState(draftSyncKey);
  // Drop an in-progress body when the review row or saved draft changes.
  if (draftSyncKey !== prevDraftSyncKey) {
    setPrevDraftSyncKey(draftSyncKey);
    setLiveRetentionDraft(null);
  }
  const retentionDraft = liveRetentionDraft ?? resolvedDraft;
  const propRetentionStatus = retentionEmail?.status ?? null;
  const retentionSyncKey = `${signal.id}\0${supervisedAction?.id ?? ""}\0${propRetentionStatus ?? ""}`;
  /** Live retention decision for the Actions header chip (refresh lag). */
  const [liveRetentionStatus, setLiveRetentionStatus] =
    useState<SupervisedActionStatus | null>(null);
  const [prevRetentionSyncKey, setPrevRetentionSyncKey] =
    useState(retentionSyncKey);
  // Drop live override when the review row or server status changes.
  if (retentionSyncKey !== prevRetentionSyncKey) {
    setPrevRetentionSyncKey(retentionSyncKey);
    setLiveRetentionStatus(null);
  }
  const chipRetentionStatus = retentionHeaderChipStatus(
    propRetentionStatus,
    liveRetentionStatus,
  );
  const retentionStatusChip = chipRetentionStatus ? (
    <InsightsReviewStatusChip
      className={RETENTION_EMAIL_STATUS_CHIP[chipRetentionStatus]}
    >
      {RETENTION_EMAIL_STATUS_LABEL[chipRetentionStatus]}
    </InsightsReviewStatusChip>
  ) : null;

  const copyReplyButton = (
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
  );

  const runActionsButton = (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="default"
            size="lg"
            className="min-h-9 shrink-0 touch-manipulation bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90"
            disabled={actionsBusy}
            aria-busy={actedPending}
            aria-haspopup={canMarkActed ? undefined : "dialog"}
            aria-expanded={canMarkActed ? undefined : feedbackGateOpen}
            aria-keyshortcuts="A Enter"
            aria-label="Mark as acted"
            onClick={requestMarkActed}
          >
            {actedPending ? (
              <ButtonSpinner />
            ) : (
              <PlayCircleIcon className="size-3.5 shrink-0" />
            )}
            Mark as acted
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align={retentionEmail ? "start" : "end"}
        >
          {ACTED_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const markActedControl = isActed ? (
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
  ) : canMarkActed ? (
    runActionsButton
  ) : (
    <Skiper45MorphConfirmation
      open={feedbackGateOpen}
      onOpenChange={setFeedbackGateOpen}
      titleId={feedbackGateTitleId}
      descriptionId={feedbackGateDescId}
      confirmRef={giveFeedbackRef}
      title={
        hasFeedback ? "Correct Feedback Required" : "Give Feedback First"
      }
      description={
        hasFeedback
          ? "Mark as acted is only for Correct reviews. Update Feedback to Correct, then try again. You run the step in your tools — Sioona never sends or CRM-tags."
          : "Choose Correct, Incorrect, or Partially Correct in Feedback first. Mark as acted records that you handled a Correct review. You execute outside — Sioona never sends or CRM-tags."
      }
      onConfirm={goToFeedback}
      trigger={runActionsButton}
    />
  );

  const markActedToolbar = (
    <div
      className="relative z-[1] flex shrink-0 flex-wrap items-center gap-2 w-full justify-end"
      data-review-actions-toolbar="true"
      role="group"
      aria-label="Acted"
    >
      {markActedControl}
    </div>
  );


  return (
    <>
      {showSupport ? (
        <Card
          size="sm"
          data-review-slot="why"
          className={wellClass}
          aria-labelledby={showWhy ? whyId : matchedId}
        >
          <InsightsReviewPaneHeader
            id={showWhy ? whyId : matchedId}
            title={showWhy ? "Supporting evidence" : "Matched"}
          />
          <CardContent className="flex min-w-0 flex-col px-0">
            <div
              className={cn(
                evalCardPadClassName,
                "flex min-w-0 flex-col gap-3 py-3",
              )}
            >
              {ruleKind ? (
                <p
                  data-fired-rule={ruleKind}
                  className="text-copy-14 leading-5 text-sio-fg-base"
                >
                  {firedRuleSentence(ruleKind)}
                </p>
              ) : null}

              {/* Phrase and keyword chips sit above the quote jump controls (at most two). */}
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

              {showWhy && showMatched ? (
                <Separator className="bg-sio-border-base" />
              ) : null}

              {showWhy ? (
                <section
                  aria-labelledby={whyId}
                  className="flex min-w-0 flex-col gap-2"
                >
                  {unavailableCopy ? (
                    <p
                      data-evidence-status={signal.evidenceStatus}
                      className="break-words text-pretty text-copy-14 leading-5 text-sio-fg-muted"
                    >
                      {unavailableCopy}
                    </p>
                  ) : quotes.length > 0 ? (
                    <ul className="flex flex-col gap-3">
                      {quotes.map(({ item, text, messageId }) => {
                        const canJump = Boolean(messageId && onFocusMessage);
                        return (
                          <li key={item} className="min-w-0">
                            <p className="mb-1 text-label-12 text-sio-fg-muted">{messageId ? `Source message ${messages.findIndex((message) => message.id === messageId) + 1} of ${messages.length} · ${messages.find((message) => message.id === messageId)?.role ?? ""} · ${signal.evidenceStatus === "valid" ? "Persisted anchor" : "Message match; exact span unavailable"}` : "Source message unavailable"}</p>
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
            </div>
          </CardContent>
        </Card>
      ) : null}
      {reviewControls}
      <Card
        ref={sectionRef}
        size="sm"
        data-review-slot="actions"
        className={wellClass}
        aria-labelledby={headingId}
      >
        <InsightsReviewPaneHeader id={headingId} title="Recommended draft">
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {retentionStatusChip}
            {copyReplyButton}
          </div>
        </InsightsReviewPaneHeader>

        <CardContent className="flex min-w-0 flex-col px-0">
          <div
            className={cn(
              evalCardPadClassName,
              "flex min-w-0 flex-col justify-center gap-1.5 py-3",
            )}
          >
            {draftLoading || isActed || canMarkActed ? null : (
              <p className="text-label-12 leading-5 text-sio-fg-muted">
                Update Feedback to Correct to unlock Mark as acted — nothing is
                sent.
              </p>
            )}
            {draftLoading ? (
              <div
                className="flex min-w-0 flex-col gap-2"
                data-review-reply-row="true"
                data-review-reply-skeleton="true"
                aria-busy="true"
                aria-label="Loading recommended reply"
              >
                <Skeleton className="h-4 w-full max-w-[28rem]" />
                <Skeleton className="h-4 w-[88%] max-w-[24rem]" />
                <Skeleton className="h-4 w-[72%] max-w-[20rem]" />
              </div>
            ) : (
              <div data-review-reply-row="true">
                <p
                  className={
                    "min-w-0 break-words text-pretty text-copy-16 " +
                    (missingAction ? "text-sio-fg-muted" : "text-sio-fg-base")
                  }
                >
                  {missingAction ? NO_RECOMMENDED_REPLY : actionText}
                </p>
              </div>
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
            omitEvidence={unavailableCopy !== null || (showWhy && quotes.length > 0)}
            signal={signal}
            customerName={customerName}
            action={supervisedAction}
            embeddedActions={retentionEmail ? markActedControl : null}
            onStatusChange={setLiveRetentionStatus}
            onDraftBodyChange={setLiveRetentionDraft}
          />

          {retentionEmail ? null : (
            <div
              className={cn(
                evalCardPadClassName,
                "flex min-w-0 flex-col gap-1.5 pb-3 pt-0",
              )}
              data-review-actions-footer="true"
            >
              {markActedToolbar}
            </div>
          )}
        </CardContent>
      </Card>

    </>
  );
}
