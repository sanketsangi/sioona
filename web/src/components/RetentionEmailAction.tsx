"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { CheckCircleOutlineIcon } from "@/components/icons/CheckCircleOutlineIcon";
import { CrossCircleIcon } from "@/components/icons/CrossCircleIcon";
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
import { AppleBorderGradient } from "@/components/v1/skiper86";
import { postSupervisedAction } from "@/lib/supervised-action-client";
import {
  queueActionKindForSignal,
  resolveRetentionEmailAction,
  type QueueActionKind,
} from "@/lib/queue-action-kind";
import type {
  Signal,
  SupervisedAction,
  SupervisedActionDecision,
  SupervisedActionStatus,
  SupervisedActionType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export {
  queueActionKindForSignal,
  resolveRetentionEmailAction,
  type QueueActionKind,
};

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

/**
 * Edit Draft stays locked (inert) while the edit dialog is open.
 */
export function draftDecisionControlsLocked(editing: boolean): boolean {
  return editing;
}

export function draftDecisionsDataAttr(
  locked: boolean,
): "locked" | "open" {
  return locked ? "locked" : "open";
}

/**
 * Recommended Actions header chip — prefer the live decision from
 * RetentionEmailAction over the last `supervisedAction` prop (refresh lag).
 */
export function retentionHeaderChipStatus(
  resolvedStatus: SupervisedActionStatus | null | undefined,
  liveStatus: SupervisedActionStatus | null,
): SupervisedActionStatus | null {
  return liveStatus ?? resolvedStatus ?? null;
}

/** Live retention draft — generated text plus whatever the reviewer has in the body. */
export type RetentionEmailDraftBody = {
  body: string;
  generatedBody: string;
};

/**
 * Body Copy Reply should paste when the reviewer changed the draft.
 * Unedited (or empty) drafts return null so the caller keeps the suggested action.
 */
export function editedRetentionDraftBody(
  draft: RetentionEmailDraftBody | null | undefined,
): string | null {
  if (!draft) return null;
  const body = draft.body.trim();
  if (!body || body === draft.generatedBody.trim()) return null;
  return body;
}

/**
 * Content-box width of `[data-review-slot="retention-email"]` where Approve,
 * Edit Draft, and Dismiss fit with labels beside Run Actions.
 * Below this, those three are icon-only. Run Actions keeps its label.
 */
export const REVIEW_ACTIONS_LABELED_MIN_PX = 424;

export function isReviewActionsCompact(contentWidthPx: number): boolean {
  return contentWidthPx < REVIEW_ACTIONS_LABELED_MIN_PX;
}

function contentBoxWidth(node: HTMLElement): number {
  const style = getComputedStyle(node);
  return (
    node.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight)
  );
}

/** Edit Draft control group — `inert` + data attr while the dialog is open. */
export const SUPERVISED_DRAFT_TITLE: Record<SupervisedActionType, string> = {
  retention_email_draft: "Retention Email",
  retention_followup_draft: "Retention Follow-up",
  lead_outreach_draft: "Lead Outreach",
  upsell_note_draft: "Upsell Note",
};

const SUPERVISED_DRAFT_ARIA: Record<SupervisedActionType, string> = {
  retention_email_draft: "Retention email",
  retention_followup_draft: "Retention follow-up",
  lead_outreach_draft: "Lead outreach",
  upsell_note_draft: "Upsell note",
};

function pendingDraftCopy(type: SupervisedActionType): string {
  if (type === "retention_email_draft") {
    return "High-confidence retention draft. Edit and save here — you send from your tools; Sioona never sends or CRM-tags.";
  }
  return `${SUPERVISED_DRAFT_TITLE[type]} draft. Edit and save here — you send from your tools; Sioona never sends or CRM-tags.`;
}

function DraftDecisionTooltip({
  label,
  compact,
  children,
}: {
  label: string;
  compact: boolean;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider>
      <Tooltip open={compact && open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RetentionEmailDecisionControlsFrame({
  locked,
  label = "Retention email decisions",
  children,
}: {
  locked: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-1"
      role="group"
      aria-label={label}
      data-draft-decisions={draftDecisionsDataAttr(locked)}
      {...(locked ? { inert: true } : {})}
    >
      {children}
    </div>
  );
}

/** Quieter subsection labels — matches Why This Fired / Matched (UI_DESIGN). */
const SECTION_LABEL_CLASS =
  "text-label-12 leading-5 font-semibold tracking-normal text-sio-fg-subtle";

/** Retention Email Evidence well (draft preview lives in Edit Draft dialog). */
const EVIDENCE_WELL_CLASS =
  "flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-control)] border border-sio-border-subtle px-2.5 py-2 bg-sio-bg-muted/40";

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

/** List is the queue table. Review is the open-preview row. */
export type QueueActionSurface = "list" | "review";

/** Follow-up list command — this control records Acted. */
export type QueueListActionLabel =
  | "Approve"
  | "Review"
  | "Mark as Acted"
  | "Marked as Acted"
  | "Approved"
  | "Edited"
  | "Dismissed";

/**
 * Open-review row label. Correct ¬acted is "Acted" (scrolls to the body;
 * Run Actions records it). Done stays "Marked as Acted".
 */
export type QueueReviewActionLabel =
  | "Approve"
  | "Review"
  | "Acted"
  | "Marked as Acted"
  | "Approved"
  | "Edited"
  | "Dismissed";

const QUEUE_LIST_ACTION_LABEL: Record<QueueActionKind, QueueListActionLabel> = {
  mark_acted: "Mark as Acted",
  acted: "Marked as Acted",
  view: "Review",
  approve: "Approve",
  review: "Review",
  approved: "Approved",
  edited: "Edited",
  dismissed: "Dismissed",
};

const QUEUE_REVIEW_ACTION_LABEL: Record<
  QueueActionKind,
  QueueReviewActionLabel
> = {
  mark_acted: "Acted",
  acted: "Marked as Acted",
  view: "Review",
  approve: "Approve",
  review: "Review",
  approved: "Approved",
  edited: "Edited",
  dismissed: "Dismissed",
};

/** Stored retention draft already has a human decision (nothing is sent). */
export function isRetentionDecisionKind(
  kind: QueueActionKind,
): kind is SupervisedActionDecision {
  return kind === "approved" || kind === "edited" || kind === "dismissed";
}

/**
 * Queue Action column shell — same pill, border, and type size as Approve.
 * Status background and text color stay on `RETENTION_EMAIL_STATUS_CHIP`.
 */
const QUEUE_DECISION_CHIP_SHELL =
  "h-7 rounded-full border-border px-3 py-0 text-[0.8rem] font-medium leading-5";

/**
 * Existing retention status chip in the queue Action column.
 * Matches the Approve control's border and text size. Colors stay per status.
 */
export function RetentionEmailDecisionChip({
  status,
}: {
  status: SupervisedActionDecision;
}) {
  return (
    <InsightsReviewStatusChip
      className={cn(
        RETENTION_EMAIL_STATUS_CHIP[status],
        QUEUE_DECISION_CHIP_SHELL,
      )}
    >
      {RETENTION_EMAIL_STATUS_LABEL[status]}
    </InsightsReviewStatusChip>
  );
}

export function queueActionLabelForKind(
  kind: QueueActionKind,
  surface: QueueActionSurface = "list",
): QueueListActionLabel | QueueReviewActionLabel {
  return surface === "review"
    ? QUEUE_REVIEW_ACTION_LABEL[kind]
    : QUEUE_LIST_ACTION_LABEL[kind];
}

/** Queue / review chrome label (Approve when Retention Email is on the rail). */
export function queueActionLabelForSignal(
  signal: Signal,
  customerName: string,
  stored: SupervisedAction | null | undefined,
  surface: "review",
): QueueReviewActionLabel;
export function queueActionLabelForSignal(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
  surface?: "list",
): QueueListActionLabel;
export function queueActionLabelForSignal(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
  surface: QueueActionSurface = "list",
): QueueListActionLabel | QueueReviewActionLabel {
  const kind = queueActionKindForSignal(signal, customerName, stored);
  return surface === "review"
    ? QUEUE_REVIEW_ACTION_LABEL[kind]
    : QUEUE_LIST_ACTION_LABEL[kind];
}

type RetentionEmailActionProps = {
  signal: Signal;
  customerName?: string;
  action?: SupervisedAction | null;
  /** Nest under Recommended Actions — section chrome, no Card. */
  embedded?: boolean;
  /**
   * When Why This Fired already shows quote evidence, omit the duplicate
   * Evidence well. Edit Draft lives in the bottom actions toolbar.
   * Default false (standalone / Why hidden / Why empty → keep Evidence).
   */
  omitEvidence?: boolean;
  /**
   * Extra control(s) after Edit Draft in the bottom toolbar (e.g. Run Actions).
   * Parent owns the control; this composes it with Edit Draft under helper copy.
   */
  embeddedActions?: ReactNode;
  /** Notify parent after a saved decision so the Actions header chip stays live. */
  onStatusChange?: (status: SupervisedActionStatus) => void;
  /** Live draft body so Copy Reply can paste an edit. Clipboard only. */
  onDraftBodyChange?: (draft: RetentionEmailDraftBody | null) => void;
  className?: string;
};

/**
 * Supervised retention email draft — optional evidence quote; Edit Draft
 * opens a dialog from the bottom actions toolbar (left of Run Actions when
 * embedded). Decisions record intent only — nothing is sent.
 * When `embedded`, quiet bordered AI-draft well (surface-quiet; no pane header Card).
 * Embedded wells always show AppleBorderGradient (skiper86) — decorative only.
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
  embeddedActions = null,
  onStatusChange,
  onDraftBodyChange,
  className,
}: RetentionEmailActionProps) {
  const headingId = useId();
  const evidenceId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const statusId = useId();
  const router = useRouter();
  const subjectRef = useRef<HTMLInputElement>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const onDraftBodyChangeRef = useRef(onDraftBodyChange);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [actionsCompact, setActionsCompact] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onDraftBodyChangeRef.current = onDraftBodyChange;
  }, [onStatusChange, onDraftBodyChange]);

  useLayoutEffect(() => {
    if (!container) {
      setActionsCompact(false);
      return;
    }
    const publish = (width: number) => {
      setActionsCompact(isReviewActionsCompact(width));
    };
    publish(contentBoxWidth(container));
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width == null) return;
      publish(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const initial = resolveRetentionEmailAction(
    signal,
    customerName,
    storedAction,
  );
  const [action, setAction] = useState<SupervisedAction | null>(initial);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [pending, setPending] = useState<SupervisedActionDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Change after Approved / Dismissed — shadcn Dialog, not inline danger text. */
  const [reviseIntent, setReviseIntent] = useState<"edit" | null>(null);
  const reviseConfirmRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onDraftBodyChangeRef.current?.(
      action
        ? { body, generatedBody: action.generatedBody }
        : null,
    );
  }, [action, body]);

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
  const draftTitle = SUPERVISED_DRAFT_TITLE[currentAction.type];
  const draftAria = SUPERVISED_DRAFT_ARIA[currentAction.type];
  const busy = pending != null;
  // Status chip + copy reflect the last decision; Edit Draft stays so partners
  // can revise. Still decision-only — never sends.
  const decidedCopy = statusMessage(currentAction.status);
  const decisionsLocked = draftDecisionControlsLocked(editing);
  const decisionsDisabled = busy || decisionsLocked;

  async function submit(decision: SupervisedActionDecision) {
    if (busy) return;
    // Edit Draft stays locked while the dialog is open; Save Edit still saves.
    if (decisionsLocked && decision !== "edited") return;
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
      onStatusChangeRef.current?.(saved.status);
      setEditing(false);
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

  function startEdit() {
    setError(null);
    setSubject(currentAction.subject);
    setBody(currentAction.body);
    setEditing(true);
  }

  function cancelEdit() {
    setSubject(currentAction.subject);
    setBody(currentAction.body);
    setError(null);
    setEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  const needsReviseWarn =
    currentAction.status === "approved" || currentAction.status === "dismissed";

  function requestEdit() {
    if (busy || decisionsLocked) return;
    setError(null);
    if (needsReviseWarn) {
      setReviseIntent("edit");
      return;
    }
    startEdit();
  }

  function confirmRevise() {
    setReviseIntent(null);
    startEdit();
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

  const actionsToolbar = (
    <div
      className="relative z-[1] flex shrink-0 flex-wrap items-center gap-2 w-full justify-end"
      data-review-actions-toolbar="true"
      role="group"
      aria-label={`${draftAria} actions`}
    >
      <RetentionEmailDecisionControlsFrame
        locked={decisionsLocked}
        label={`${draftAria} decisions`}
      >
        <DraftDecisionTooltip label="Approve" compact={actionsCompact}>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="btn-secondary h-9 min-h-9 shrink-0 touch-manipulation gap-1.5 px-2.5"
            disabled={decisionsDisabled}
            aria-label="Approve"
            onClick={() => void submit("approved")}
          >
            {pending === "approved" ? (
              <ButtonSpinner data-icon="inline-start" />
            ) : (
              <CheckCircleOutlineIcon
                data-icon="inline-start"
                className="size-3.5 shrink-0"
              />
            )}
            <span className="review-action-label" aria-hidden="true">Approve</span>
          </Button>
        </DraftDecisionTooltip>
        <DraftDecisionTooltip label="Edit Draft" compact={actionsCompact}>
          <Button
            ref={editButtonRef}
            type="button"
            variant="outline"
            size="lg"
            className="btn-secondary h-9 min-h-9 shrink-0 touch-manipulation gap-1.5 px-2.5"
            disabled={decisionsDisabled}
            aria-label="Edit Draft"
            aria-haspopup="dialog"
            aria-expanded={editing}
            onClick={requestEdit}
          >
            <RetentionEmailDraftIcon
              data-icon="inline-start"
              className="size-3.5 shrink-0"
            />
            <span className="review-action-label" aria-hidden="true">Edit Draft</span>
          </Button>
        </DraftDecisionTooltip>
        <DraftDecisionTooltip label="Dismiss" compact={actionsCompact}>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="btn-secondary h-9 min-h-9 shrink-0 touch-manipulation gap-1.5 px-2.5"
            disabled={decisionsDisabled}
            aria-label="Dismiss"
            onClick={() => void submit("dismissed")}
          >
            {pending === "dismissed" ? (
              <ButtonSpinner data-icon="inline-start" />
            ) : (
              <CrossCircleIcon
                data-icon="inline-start"
                className="size-3.5 shrink-0"
              />
            )}
            <span className="review-action-label" aria-hidden="true">Dismiss</span>
          </Button>
        </DraftDecisionTooltip>
      </RetentionEmailDecisionControlsFrame>
      {embeddedActions}
    </div>
  );

  const bodyInner = (
    <>
      {currentAction.status === "pending" ? (
        <p className="text-pretty text-copy-14 text-sio-fg-subtle">
          {pendingDraftCopy(currentAction.type)}
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
      {error && !editing ? (
        <p
          className="text-label-12 leading-5 text-sio-status-danger-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {actionsToolbar}

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

      {!omitEvidence ? (
        <div className="retention-email-columns">
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
        </div>
      ) : null}

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
      >
        <DialogContent
          className="overscroll-contain motion-reduce:animate-none sm:max-w-lg sm:min-h-[491px]"
          showCloseButton
          data-retention-email-panel="draft-edit"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            subjectRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RetentionEmailDraftIcon className="size-4 shrink-0" />
              Edit Draft
            </DialogTitle>
            <DialogDescription>
              Saves a revised draft for evaluation. You send from your tools —
              Sioona never sends or CRM-tags.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-w-0 flex-col gap-3"
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
                className="min-h-9 border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base"
                aria-invalid={!subject.trim()}
                disabled={busy}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={bodyId} className="text-label-12">
                Body
              </Label>
              <Textarea
                id={bodyId}
                name="retentionEmailBody"
                rows={14}
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
                className="min-h-56 resize-y border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base"
                aria-invalid={!body.trim()}
                disabled={busy}
              />
            </div>
            {error ? (
              <p
                className="text-label-12 leading-5 text-sio-status-danger-fg"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="btn-secondary"
                disabled={busy}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-primary"
                disabled={busy}
                aria-busy={pending === "edited"}
              >
                {pending === "edited" ? <ButtonSpinner /> : null}
                Save Edit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) {
    return (
      <section
        ref={setContainer}
        data-review-slot="retention-email"
        data-retention-border="gradient"
        className={cn(
          "relative surface-quiet overflow-hidden",
          // Hide static border so AppleBorderGradient reads alone.
          "![border-color:transparent]",
          // Inset from Recommended Actions chrome — avoid full-bleed nested border.
          "mx-3 mb-3 mt-3 sm:mx-4 sm:mb-4",
          evalCardPadClassName,
          "flex min-w-0 flex-col gap-2 py-2.5",
          className,
        )}
        aria-labelledby={headingId}
      >
        <AppleBorderGradient
          preview
          intensity="sm"
          className="rounded-[var(--radius-panel)] after:rounded-[calc(var(--radius-panel)-2px)]"
        />
        <div className="relative z-[1] flex min-w-0 items-center gap-2">
          <PlayCircleIcon className="size-4 shrink-0 text-sio-fg-base" />
          <h3 id={headingId} className={REVIEW_PANE_TITLE_CLASS}>
            {draftTitle}
          </h3>
        </div>
        <div className="relative z-[1] flex min-w-0 flex-col gap-2">
          {bodyInner}
        </div>
      </section>
    );
  }

  return (
    <Card
      ref={setContainer}
      size="sm"
      data-review-slot="retention-email"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title={draftTitle}>
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
