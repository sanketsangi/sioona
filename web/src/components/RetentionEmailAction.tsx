"use client";

import { Check, PencilSimple, X } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type TransitionEvent } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { RetentionEmailDraftIcon } from "@/components/icons/RetentionEmailDraftIcon";
import { RetentionEmailEvidenceIcon } from "@/components/icons/RetentionEmailEvidenceIcon";
import {
  InsightsReviewPaneHeader,
  REVIEW_PANE_TITLE_CLASS,
} from "@/components/InsightsReviewPaneHeader";
import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { postSupervisedAction } from "@/lib/supervised-action-client";
import {
  createRetentionEmailAction,
  shouldGenerateRetentionEmail,
} from "@/lib/supervised-actions";
import type {
  Signal,
  SupervisedAction,
  SupervisedActionDecision,
  SupervisedActionStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** First N `\n`-split lines for Draft view; expand when longer. */
export const RETENTION_EMAIL_BODY_PREVIEW_LINES = 3;

export function retentionEmailBodyPreview(
  body: string,
  lineCount: number = RETENTION_EMAIL_BODY_PREVIEW_LINES,
): { preview: string; remainder: string; expandable: boolean } {
  const lines = body.split("\n");
  if (lines.length <= lineCount) {
    return { preview: body, remainder: "", expandable: false };
  }
  return {
    preview: lines.slice(0, lineCount).join("\n"),
    remainder: lines.slice(lineCount).join("\n"),
    expandable: true,
  };
}

export const RETENTION_EMAIL_STATUS_CHIP: Record<
  SupervisedActionStatus,
  string
> = {
  pending: "bg-sio-bg-muted text-sio-fg-muted",
  approved: "bg-sio-status-success-bg text-sio-status-success-fg",
  edited: "bg-sio-status-warning-bg text-sio-status-warning-fg",
  dismissed: "bg-sio-bg-muted text-sio-fg-subtle",
};

export const RETENTION_EMAIL_STATUS_LABEL: Record<
  SupervisedActionStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  edited: "Edited",
  dismissed: "Dismissed",
};

const APPROVE_TOOLTIP =
  "Records approval. You send from your tools — Sioona never sends or CRM-tags.";

/** Quieter subsection labels — matches Why This Fired / Matched (UI_DESIGN). */
const SECTION_LABEL_CLASS =
  "text-label-12 leading-5 font-semibold tracking-normal text-sio-fg-subtle";

/** Evidence — quiet tonal well (secondary to the email preview). */
const EVIDENCE_WELL_CLASS =
  "flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-sio-border-subtle px-3 py-2.5 bg-sio-bg-muted/40";

/**
 * Draft — flush email preview (no nested card-in-card). Hierarchy via type;
 * decisions sit under the body with parent `gap-2` (no hairline).
 */
const DRAFT_WELL_CLASS = "flex min-w-0 flex-col gap-2.5";

/** Subject line — stronger than body so the preview reads as an email. */
const DRAFT_SUBJECT_CLASS =
  "m-0 break-words text-label-14 font-semibold leading-5 tracking-[-0.01em] text-sio-fg-base";

/** Body — readable preview; slightly looser leading than dense UI chrome. */
const DRAFT_BODY_CLASS =
  "m-0 whitespace-pre-wrap break-words font-sans text-pretty text-copy-14 leading-6 text-sio-fg-subtle";

/** Decision row — Approve / Edit / Dismiss; spacing from parent `gap-2`. */
const DRAFT_ACTIONS_CLASS =
  "flex flex-wrap items-center justify-end gap-2";

function statusMessage(status: SupervisedActionStatus): string | null {
  switch (status) {
    case "approved":
      return "Approved — not sent. Run it in your tools; Sioona never CRM-tags.";
    case "edited":
      return "Edited draft saved — not sent. You send from your tools.";
    case "dismissed":
      return "Dismissed. Sioona never sends — nothing to run outside.";
    default:
      return null;
  }
}

export function resolveRetentionEmailAction(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
): SupervisedAction | null {
  if (stored) {
    // Neon stubs may have locked an empty quote before chat evidence joined.
    // Prefer live signal evidence for display without rewriting decided drafts.
    if (!stored.evidenceQuote.trim() && signal.evidence.length > 0) {
      const filled = createRetentionEmailAction({
        signal,
        customerName,
        evidence: signal.evidence,
        id: stored.id,
        createdAt: stored.createdAt,
      });
      if (filled.evidenceQuote) {
        return { ...stored, evidenceQuote: filled.evidenceQuote };
      }
    }
    return stored;
  }
  if (!shouldGenerateRetentionEmail(signal)) return null;
  return createRetentionEmailAction({
    signal,
    customerName,
    evidence: signal.evidence,
  });
}

/** Insights list Action column — cadence-aware, not outbound. */
export type QueueActionKind =
  | "mark_acted"
  | "acted"
  | "view"
  | "approve"
  | "review";

const QUEUE_ACTION_LABEL: Record<QueueActionKind, string> = {
  mark_acted: "Mark as Acted",
  acted: "Marked as Acted",
  view: "Review",
  approve: "Approve",
  review: "Review",
};

/**
 * Queue Action kind by signal state.
 * Follow-up Correct ¬acted → Mark as Acted; Done → Marked as Acted;
 * pending with Retention Email → Approve; else Review.
 */
export function queueActionKindForSignal(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
): QueueActionKind {
  if (signal.status === "acted") return "acted";
  if (signal.feedback?.label === "correct") return "mark_acted";
  return resolveRetentionEmailAction(signal, customerName, stored)
    ? "approve"
    : "review";
}

export function queueActionLabelForKind(kind: QueueActionKind): string {
  return QUEUE_ACTION_LABEL[kind];
}

/** Queue / review chrome label (Approve when Retention Email is on the rail). */
export function queueActionLabelForSignal(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
): "Approve" | "Review" | "Mark as Acted" | "Marked as Acted" {
  const kind = queueActionKindForSignal(signal, customerName, stored);
  return queueActionLabelForKind(kind) as
    | "Approve"
    | "Review"
    | "Mark as Acted"
    | "Marked as Acted";
}

type RetentionEmailActionProps = {
  signal: Signal;
  customerName?: string;
  action?: SupervisedAction | null;
  /** Nest under Recommended Actions — section chrome, no Card. */
  embedded?: boolean;
  /**
   * When Why This Fired already shows quote evidence, omit the duplicate
   * Evidence well. Keep Draft + Approve / Edit / Dismiss. Default false
   * (standalone / Why hidden / Why empty → keep Evidence).
   */
  omitEvidence?: boolean;
  className?: string;
};

/**
 * Supervised retention email draft — evidence quote beside the draft.
 * Approve / Edit / Dismiss record a decision only. Nothing is sent.
 * When `embedded`, quiet surface-quiet section with a flush email preview
 * (no nested draft card).
 */
export function RetentionEmailAction(props: RetentionEmailActionProps) {
  const { signal, customerName = "", action: storedAction = null } = props;
  const resetKey = [
    signal.id,
    customerName,
    storedAction?.id ?? "",
    storedAction?.status ?? "",
    storedAction?.subject ?? "",
    storedAction?.evidenceQuote ?? "",
    signal.evidence.join("\0"),
  ].join("\0");

  return <RetentionEmailActionView key={resetKey} {...props} />;
}

function RetentionEmailActionView({
  signal,
  customerName = "",
  action: storedAction = null,
  embedded = false,
  omitEvidence = false,
  className,
}: RetentionEmailActionProps) {
  const headingId = useId();
  const evidenceId = useId();
  const draftId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const statusId = useId();
  const router = useRouter();
  const subjectRef = useRef<HTMLInputElement>(null);

  const initial = resolveRetentionEmailAction(
    signal,
    customerName,
    storedAction,
  );
  const [action, setAction] = useState<SupervisedAction | null>(initial);
  const [editing, setEditing] = useState(false);
  /** Keep the edit form mounted through the exit crossfade. */
  const [editMounted, setEditMounted] = useState(false);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  /** Draft view pane: collapse long bodies to first N lines. */
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [pending, setPending] = useState<SupervisedActionDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Change after Approved / Dismissed — shadcn Dialog, not inline danger text. */
  const [reviseIntent, setReviseIntent] = useState<
    "approve" | "edit" | "dismiss" | null
  >(null);
  const reviseConfirmRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const resetFieldsOnUnmountRef = useRef(false);

  const dirty =
    editing &&
    action != null &&
    (subject.trim() !== action.subject.trim() ||
      body.trim() !== action.body.trim());

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!action) return null;

  // Narrowed for nested handlers — outer early-return does not carry into closures.
  const currentAction = action;
  const busy = pending != null;
  // Status chip + copy reflect the last decision; CTAs stay so partners can revise
  // (Approve again, Edit draft, or Dismiss). Still decision-only — never sends.
  const decisionOpen = true;
  const decidedCopy = statusMessage(currentAction.status);
  const bodyPreview = retentionEmailBodyPreview(currentAction.body);
  const viewBodyText =
    !bodyPreview.expandable || bodyExpanded
      ? currentAction.body
      : bodyPreview.preview;
  const bodyExpandId = `${draftId}-body-expand`;

  async function submit(decision: SupervisedActionDecision) {
    if (busy) return;
    if (decision === "edited" || decision === "approved") {
      if (!subject.trim() || !body.trim()) {
        setError("Subject and body are required.");
        subjectRef.current?.focus();
        return;
      }
    }
    setPending(decision);
    setError(null);
    try {
      const saved = await postSupervisedAction(signal, {
        decision,
        subject: subject.trim(),
        draftBody: body.trim(),
      });
      setAction(saved);
      setSubject(saved.subject);
      setBody(saved.body);
      resetFieldsOnUnmountRef.current = false;
      setEditing(false);
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setEditMounted(false);
      }
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not save this decision. Try again.";
      console.error("[supervised-action]", message);
      setError(message);
    } finally {
      setPending(null);
    }
  }

  function prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function unmountEdit() {
    setEditMounted(false);
    setEditing(false);
    if (resetFieldsOnUnmountRef.current && action) {
      setSubject(action.subject);
      setBody(action.body);
    }
    resetFieldsOnUnmountRef.current = false;
    setError(null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  function startEdit() {
    setError(null);
    resetFieldsOnUnmountRef.current = false;
    setEditMounted(true);
    if (prefersReducedMotion()) {
      setEditing(true);
      requestAnimationFrame(() => subjectRef.current?.focus());
      return;
    }
    // Mount at opacity 0 (mode=view), then flip to edit so enter crossfades.
    requestAnimationFrame(() => {
      setEditing(true);
      requestAnimationFrame(() => subjectRef.current?.focus());
    });
  }

  function endEdit(resetFields: boolean) {
    resetFieldsOnUnmountRef.current = resetFields;
    if (!editMounted) {
      unmountEdit();
      return;
    }
    if (prefersReducedMotion() || !editing) {
      unmountEdit();
      return;
    }
    setEditing(false);
  }

  function cancelEdit() {
    endEdit(true);
  }

  function onEditPaneTransitionEnd(event: TransitionEvent<HTMLFormElement>) {
    if (event.propertyName !== "opacity") return;
    if (event.target !== event.currentTarget) return;
    if (editing || !editMounted) return;
    unmountEdit();
  }

  const needsReviseWarn =
    currentAction.status === "approved" || currentAction.status === "dismissed";

  function requestChange(intent: "approve" | "edit" | "dismiss") {
    if (busy) return;
    setError(null);
    if (needsReviseWarn) {
      setReviseIntent(intent);
      return;
    }
    if (intent === "edit") {
      startEdit();
      return;
    }
    if (intent === "approve") {
      void submit("approved");
      return;
    }
    void submit("dismissed");
  }

  function confirmRevise() {
    const intent = reviseIntent;
    setReviseIntent(null);
    if (!intent) return;
    if (intent === "edit") {
      startEdit();
      return;
    }
    if (intent === "approve") {
      void submit("approved");
      return;
    }
    void submit("dismissed");
  }

  const reviseStatusLabel =
    currentAction.status === "approved"
      ? "approved"
      : currentAction.status === "dismissed"
        ? "dismissed"
        : "decided";

  const statusChip = (
    <InsightsReviewStatusChip
      className={RETENTION_EMAIL_STATUS_CHIP[currentAction.status]}
    >
      {RETENTION_EMAIL_STATUS_LABEL[currentAction.status]}
    </InsightsReviewStatusChip>
  );

  const bodyInner = (
    <>
      {currentAction.status === "pending" ? (
        <p className="text-pretty text-copy-14 text-sio-fg-subtle">
          High-confidence retention draft. Approve records intent only — you
          send from your tools; Sioona never sends or CRM-tags.
        </p>
      ) : null}

      {decidedCopy ? (
        <p className="text-pretty text-copy-14 text-sio-fg-subtle">
          {decidedCopy}
        </p>
      ) : null}

      <p id={statusId} className="sr-only" aria-live="polite">
        {pending ? "Saving…" : error ? error : null}
      </p>
      {error ? (
        <p
          className="text-label-12 leading-5 text-sio-status-danger-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Dialog
        open={reviseIntent != null}
        onOpenChange={(open) => {
          if (!open) setReviseIntent(null);
        }}
      >
        <DialogContent
          className="overscroll-contain motion-reduce:animate-none"
          showCloseButton
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            reviseConfirmRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Change Decision?</DialogTitle>
            <DialogDescription>
              This draft was already {reviseStatusLabel}. Updating records a new
              decision only — you still send from your tools; Sioona never sends
              or CRM-tags.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="btn-secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              ref={reviseConfirmRef}
              type="button"
              className="btn-primary"
              onClick={confirmRevise}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence when Why is hidden/empty; edit opens inside the Draft well only. */}
      <div className="retention-email-columns">
        {omitEvidence ? null : (
          <section
            data-retention-email-panel="evidence"
            aria-labelledby={evidenceId}
            className={EVIDENCE_WELL_CLASS}
          >
            <h4
              id={evidenceId}
              className={`${SECTION_LABEL_CLASS} flex items-center gap-2`}
            >
              <RetentionEmailEvidenceIcon className="size-4 shrink-0 text-sio-fg-subtle" />
              <span>Evidence</span>
            </h4>
            {currentAction.evidenceQuote ? (
              <blockquote
                className="m-0 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base"
                translate="no"
              >
                “{currentAction.evidenceQuote}”
              </blockquote>
            ) : (
              <p className="m-0 text-pretty text-copy-14 leading-5 text-sio-fg-muted">
                No local evidence quote.
              </p>
            )}
          </section>
        )}

        <section
          data-retention-email-panel="draft"
          aria-labelledby={draftId}
          className={cn(
            DRAFT_WELL_CLASS,
            // Hairline only when Evidence sits above — avoid boxing the draft.
            !omitEvidence && "border-t border-sio-border-subtle pt-2.5",
          )}
        >
          <h4
            id={draftId}
            className={`${SECTION_LABEL_CLASS} flex items-center gap-2`}
          >
            <RetentionEmailDraftIcon className="size-4 shrink-0 text-sio-fg-subtle" />
            <span>Draft</span>
          </h4>

          <div
            className="retention-email-draft-swap"
            data-draft-mode={editing ? "edit" : "view"}
          >
            <div
              className="retention-email-draft-pane retention-email-draft-pane-view flex min-w-0 flex-col gap-2"
              aria-hidden={editing}
              {...(editing ? { inert: true } : {})}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className={DRAFT_SUBJECT_CLASS} translate="no">
                  {currentAction.subject}
                </p>
                <pre id={bodyExpandId} className={DRAFT_BODY_CLASS}>
                  {viewBodyText}
                </pre>
                {bodyPreview.expandable ? (
                  <button
                    type="button"
                    className="btn-tertiary inline-flex min-h-11 touch-manipulation items-center self-start rounded-full border border-sio-border-subtle px-2.5 py-0.5 text-label-12 font-medium text-sio-fg-subtle hover:border-sio-border-strong hover:text-sio-fg-base md:min-h-6"
                    aria-expanded={bodyExpanded}
                    aria-controls={bodyExpandId}
                    onClick={() => setBodyExpanded((open) => !open)}
                  >
                    {bodyExpanded ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </div>
              {decisionOpen ? (
                <div
                  className={DRAFT_ACTIONS_CLASS}
                  role="group"
                  aria-label="Retention email decisions"
                >
                  <TooltipProvider delayDuration={400}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex shrink-0">
                          <Button
                            type="button"
                            className="btn-primary min-h-11 shrink-0 touch-manipulation gap-1.5 px-2.5 whitespace-nowrap md:min-h-9 md:px-3"
                            disabled={busy}
                            aria-busy={pending === "approved"}
                            aria-haspopup={
                              needsReviseWarn ? "dialog" : undefined
                            }
                            title={APPROVE_TOOLTIP}
                            onClick={() => requestChange("approve")}
                          >
                            {pending === "approved" ? (
                              <ButtonSpinner />
                            ) : (
                              <Check
                                className="size-3.5 shrink-0"
                                weight="bold"
                                aria-hidden
                              />
                            )}
                            <span className="hidden sm:inline">
                              Approve Draft
                            </span>
                            <span className="sm:hidden">Approve</span>
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start">
                        {APPROVE_TOOLTIP}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button
                    ref={editButtonRef}
                    type="button"
                    variant="outline"
                    className="btn-secondary min-h-11 shrink-0 touch-manipulation gap-1.5 px-2.5 whitespace-nowrap md:min-h-9 md:px-3"
                    disabled={busy}
                    aria-haspopup={needsReviseWarn ? "dialog" : undefined}
                    onClick={() => requestChange("edit")}
                  >
                    <PencilSimple
                      className="size-3.5 shrink-0"
                      weight="bold"
                      aria-hidden
                    />
                    Edit
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="btn-secondary min-h-11 shrink-0 touch-manipulation gap-1.5 px-2.5 whitespace-nowrap md:min-h-9 md:px-3"
                    disabled={busy}
                    aria-busy={pending === "dismissed"}
                    aria-haspopup={needsReviseWarn ? "dialog" : undefined}
                    onClick={() => requestChange("dismiss")}
                  >
                    {pending === "dismissed" ? (
                      <ButtonSpinner />
                    ) : (
                      <X
                        className="size-3.5 shrink-0"
                        weight="bold"
                        aria-hidden
                      />
                    )}
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </div>

            {editMounted ? (
            <form
              className="retention-email-draft-pane retention-email-draft-pane-edit flex min-w-0 flex-col gap-2.5"
              aria-hidden={!editing}
              {...(!editing ? { inert: true } : {})}
              onTransitionEnd={onEditPaneTransitionEnd}
              onSubmit={(event) => {
                event.preventDefault();
                void submit("edited");
              }}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={subjectId} className="text-label-12">
                  Subject
                </Label>
                <Input
                  ref={subjectRef}
                  id={subjectId}
                  name="retentionEmailSubject"
                  type="text"
                  autoComplete="off"
                  spellCheck
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="e.g. Following up on your account…"
                  className="min-h-11 border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base md:min-h-9 md:text-sm"
                  aria-invalid={!subject.trim()}
                  tabIndex={editing ? undefined : -1}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={bodyId} className="text-label-12">
                  Body
                </Label>
                <Textarea
                  id={bodyId}
                  name="retentionEmailBody"
                  rows={6}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      void submit("edited");
                    }
                  }}
                  placeholder="Short, polite follow-up…"
                  className="min-h-24 resize-y border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base md:text-sm"
                  aria-invalid={!body.trim()}
                  tabIndex={editing ? undefined : -1}
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-sio-border-subtle pt-2.5">
                <Button
                  type="submit"
                  className="btn-primary min-h-11 touch-manipulation md:min-h-9"
                  disabled={busy}
                  aria-busy={pending === "edited"}
                  tabIndex={editing ? undefined : -1}
                >
                  {pending === "edited" ? <ButtonSpinner /> : null}
                  Save Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="btn-secondary min-h-11 touch-manipulation md:min-h-9"
                  disabled={busy}
                  onClick={cancelEdit}
                  tabIndex={editing ? undefined : -1}
                >
                  Cancel
                </Button>
              </div>
            </form>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );

  if (embedded) {
    return (
      <section
        data-review-slot="retention-email"
        className={cn(
          "surface-quiet overflow-hidden",
          // Inset from Recommended Actions chrome — avoid full-bleed nested border.
          "mx-3 mb-3 mt-3 sm:mx-4 sm:mb-4",
          evalCardPadClassName,
          "flex min-w-0 flex-col gap-2 py-2.5",
          className,
        )}
        aria-labelledby={headingId}
      >
        <div className="flex min-w-0 items-center gap-2">
          <PlayCircleIcon className="size-4 shrink-0 text-sio-fg-base" />
          <h3 id={headingId} className={REVIEW_PANE_TITLE_CLASS}>
            Retention Email
          </h3>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {bodyInner}
        </div>
      </section>
    );
  }

  return (
    <Card
      size="sm"
      data-review-slot="retention-email"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title="Retention Email">
        {statusChip}
      </InsightsReviewPaneHeader>
      <CardContent className="flex min-w-0 flex-col px-0">
        <div
          className={cn(
            evalCardPadClassName,
            "flex min-w-0 flex-col gap-3 py-3",
          )}
        >
          {bodyInner}
        </div>
      </CardContent>
    </Card>
  );
}
