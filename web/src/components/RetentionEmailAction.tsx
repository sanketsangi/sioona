"use client";

import { Check, PencilSimple, X } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
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

const STATUS_CHIP: Record<SupervisedActionStatus, string> = {
  pending: "bg-sio-bg-muted text-sio-fg-muted",
  approved: "bg-sio-status-success-bg text-sio-status-success-fg",
  edited: "bg-sio-status-warning-bg text-sio-status-warning-fg",
  dismissed: "bg-sio-bg-muted text-sio-fg-subtle",
};

const STATUS_LABEL: Record<SupervisedActionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  edited: "Edited",
  dismissed: "Dismissed",
};

const APPROVE_TOOLTIP = "Records approval. Does not send the email.";

function statusMessage(status: SupervisedActionStatus): string | null {
  switch (status) {
    case "approved":
      return "Approved — not sent.";
    case "edited":
      return "Edited draft saved — not sent.";
    case "dismissed":
      return "Dismissed. No email will be sent.";
    default:
      return null;
  }
}

export function resolveRetentionEmailAction(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
): SupervisedAction | null {
  if (stored) return stored;
  if (!shouldGenerateRetentionEmail(signal)) return null;
  return createRetentionEmailAction({
    signal,
    customerName,
    evidence: signal.evidence,
  });
}

type RetentionEmailActionProps = {
  signal: Signal;
  customerName?: string;
  action?: SupervisedAction | null;
  className?: string;
};

/**
 * Supervised retention email draft — evidence quote beside the draft.
 * Approve / Edit / Dismiss record a decision only. Nothing is sent.
 */
export function RetentionEmailAction({
  signal,
  customerName = "",
  action: storedAction = null,
  className,
}: RetentionEmailActionProps) {
  const headingId = useId();
  const evidenceId = useId();
  const draftId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const statusId = useId();
  const router = useRouter();
  const approveRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

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
  const [confirm, setConfirm] = useState<"approve" | "dismiss" | null>(null);

  useEffect(() => {
    const next = resolveRetentionEmailAction(
      signal,
      customerName,
      storedAction,
    );
    setAction(next);
    setSubject(next?.subject ?? "");
    setBody(next?.body ?? "");
    setEditing(false);
    setError(null);
    setConfirm(null);
  }, [signal, customerName, storedAction]);

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
  const isPending = currentAction.status === "pending";
  const decidedCopy = statusMessage(currentAction.status);

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
      setEditing(false);
      setConfirm(null);
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
    setEditing(true);
    setError(null);
    requestAnimationFrame(() => subjectRef.current?.focus());
  }

  function cancelEdit() {
    setSubject(currentAction.subject);
    setBody(currentAction.body);
    setEditing(false);
    setError(null);
  }

  return (
    <Card
      size="sm"
      data-review-slot="retention-email"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title="Retention Email">
        <InsightsReviewStatusChip className={STATUS_CHIP[currentAction.status]}>
          {STATUS_LABEL[currentAction.status]}
        </InsightsReviewStatusChip>
      </InsightsReviewPaneHeader>

      <CardContent className="flex min-w-0 flex-col px-0">
        <div
          className={cn(
            evalCardPadClassName,
            "flex min-w-0 flex-col gap-3 py-3",
          )}
        >
          <p className="text-pretty text-copy-14 text-sio-fg-subtle">
            High-confidence retention draft. Approve records intent only — the
            email is not sent.
          </p>

          {isPending ? (
            editing ? (
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
                    placeholder="e.g. Checking in on your account…"
                    className="min-h-11 border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base md:min-h-9 md:text-sm"
                    aria-invalid={!subject.trim()}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={bodyId} className="text-label-12">
                    Body
                  </Label>
                  <Textarea
                    id={bodyId}
                    name="retentionEmailBody"
                    rows={8}
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
                    className="min-h-32 border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base md:text-sm"
                    aria-invalid={!body.trim()}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    className="btn-primary min-h-11 touch-manipulation md:min-h-9"
                    disabled={busy}
                    aria-busy={pending === "edited"}
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
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Retention email decisions"
              >
                <Dialog
                  open={confirm === "approve"}
                  onOpenChange={(open) =>
                    setConfirm(open ? "approve" : null)
                  }
                >
                  <TooltipProvider delayDuration={400}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            className="btn-primary min-h-11 touch-manipulation md:min-h-9"
                            disabled={busy}
                            aria-busy={pending === "approved"}
                            aria-haspopup="dialog"
                            title={APPROVE_TOOLTIP}
                            onClick={() => setConfirm("approve")}
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
                            Approve &amp; Send
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start">
                        {APPROVE_TOOLTIP}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DialogContent
                    className="overscroll-contain motion-reduce:animate-none"
                    showCloseButton
                    onOpenAutoFocus={(event) => {
                      event.preventDefault();
                      approveRef.current?.focus();
                    }}
                  >
                    <DialogHeader>
                      <DialogTitle>Approve Draft</DialogTitle>
                      <DialogDescription>
                        This records your approval for later evaluation. The
                        email is not sent.
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
                        ref={approveRef}
                        type="button"
                        className="btn-primary"
                        disabled={busy}
                        onClick={() => void submit("approved")}
                      >
                        {pending === "approved" ? <ButtonSpinner /> : null}
                        Approve Draft
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button
                  type="button"
                  variant="outline"
                  className="btn-secondary min-h-11 touch-manipulation md:min-h-9"
                  disabled={busy}
                  onClick={startEdit}
                >
                  <PencilSimple
                    className="size-3.5 shrink-0"
                    weight="bold"
                    aria-hidden
                  />
                  Edit
                </Button>

                <Dialog
                  open={confirm === "dismiss"}
                  onOpenChange={(open) =>
                    setConfirm(open ? "dismiss" : null)
                  }
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="btn-secondary min-h-11 touch-manipulation md:min-h-9"
                    disabled={busy}
                    aria-haspopup="dialog"
                    onClick={() => setConfirm("dismiss")}
                  >
                    <X className="size-3.5 shrink-0" weight="bold" aria-hidden />
                    Dismiss
                  </Button>
                  <DialogContent
                    className="overscroll-contain motion-reduce:animate-none"
                    showCloseButton
                    onOpenAutoFocus={(event) => {
                      event.preventDefault();
                      dismissRef.current?.focus();
                    }}
                  >
                    <DialogHeader>
                      <DialogTitle>Dismiss Draft</DialogTitle>
                      <DialogDescription>
                        This records that the draft should not be used. Nothing
                        is sent.
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
                        ref={dismissRef}
                        type="button"
                        className="btn-primary"
                        disabled={busy}
                        onClick={() => void submit("dismissed")}
                      >
                        {pending === "dismissed" ? <ButtonSpinner /> : null}
                        Dismiss Draft
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )
          ) : null}

          {decidedCopy ? (
            <p className="text-label-12 leading-5 text-sio-fg-muted">
              {decidedCopy}
            </p>
          ) : null}

          <p id={statusId} className="sr-only" aria-live="polite">
            {pending
              ? "Saving…"
              : error
                ? error
                : decidedCopy}
          </p>
          {error ? (
            <p
              className="text-label-12 leading-5 text-sio-status-danger-fg"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <section
              aria-labelledby={evidenceId}
              className="min-w-0 rounded-[var(--radius-control)] border border-sio-border-base bg-sio-bg-muted/40 px-3 py-2.5"
            >
              <h4
                id={evidenceId}
                className="text-label-12 font-medium leading-5 text-sio-fg-subtle"
              >
                Evidence
              </h4>
              {currentAction.evidenceQuote ? (
                <blockquote
                  className="mt-1.5 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base"
                  translate="no"
                >
                  “{currentAction.evidenceQuote}”
                </blockquote>
              ) : (
                <p className="mt-1.5 text-pretty text-copy-14 leading-5 text-sio-fg-muted">
                  No local evidence quote.
                </p>
              )}
            </section>

            <section
              aria-labelledby={draftId}
              className="min-w-0 rounded-[var(--radius-control)] border border-sio-border-base bg-sio-bg-base px-3 py-2.5"
            >
              <h4
                id={draftId}
                className="text-label-12 font-medium leading-5 text-sio-fg-subtle"
              >
                Draft
              </h4>
              <p
                className="mt-1.5 break-words text-label-14 font-medium text-sio-fg-base"
                translate="no"
              >
                {currentAction.subject}
              </p>
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-pretty text-copy-14 leading-5 text-sio-fg-base">
                {currentAction.body}
              </pre>
            </section>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
