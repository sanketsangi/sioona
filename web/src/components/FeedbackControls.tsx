"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { GroundTruthControl } from "@/components/GroundTruthControl";
import { InsightsReviewHelperNote } from "@/components/InsightsReviewHelperNote";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
import { CrossCircleIcon } from "@/components/icons/CrossCircleIcon";
import { GoodIcon } from "@/components/icons/GoodIcon";
import { WarningIcon } from "@/components/icons/WarningIcon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emitFeedbackSaved } from "@/lib/feedback-saved";
import {
  correctAdvanceHref,
  feedbackLabelForShortcutKey,
  isEditableShortcutTarget,
} from "@/lib/review-triage";
import { postSignalFeedback } from "@/lib/signal-feedback-client";
import type { FeedbackLabel, Signal, SignalType } from "@/lib/types";
import { afterFeedbackHref, viewHref, type SignalReviewTriage } from "@/lib/views";
import { cn } from "@/lib/utils";

const options: {
  label: FeedbackLabel;
  title: string;
  hint: string;
  shortcut: string;
  Icon: ComponentType<{ className?: string; "data-icon"?: string }>;
}[] = [
  {
    label: "correct",
    title: "Correct",
    hint: "Signal is correct and useful",
    shortcut: "C",
    Icon: GoodIcon,
  },
  {
    label: "incorrect",
    title: "Incorrect",
    hint: "Not a real opportunity",
    shortcut: "I",
    Icon: CrossCircleIcon,
  },
  {
    label: "partially_correct",
    title: "Partially Correct",
    hint: "Right-ish signal, bad rationale",
    shortcut: "P",
    Icon: WarningIcon,
  },
];

/** Header chip chrome — quiet status fill for Feedback Pending / C / I / P. */
const FEEDBACK_CHIP: Record<FeedbackLabel | "pending", string> = {
  pending: "bg-sio-bg-muted text-sio-fg-muted",
  correct: "bg-sio-status-success-bg text-sio-status-success-fg",
  incorrect: "bg-sio-status-danger-bg text-sio-status-danger-fg",
  partially_correct: "bg-sio-status-warning-bg text-sio-status-warning-fg",
};

/**
 * After Incorrect or Partially correct. The note saves with the label and
 * is shown beside the Adapt term; it is not the phrase that gets added.
 */
export const ADAPT_NOTE_HELPER =
  "This note is shown beside the Adapt term. A full sentence is not the phrase that gets added.";

const outlineBtn =
  "min-h-9 w-full touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive";
const primaryBtn =
  "min-h-9 w-full touch-manipulation bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90";

/**
 * Inverse fill chrome: Correct is the default primary while Pending;
 * after a choice, only the selected label stays inverse (exclusive).
 * Does not imply aria-pressed — that stays on the saved/optimistic label.
 */
export function isFeedbackPrimaryChrome(
  optionLabel: FeedbackLabel,
  feedbackLabel: FeedbackLabel | null,
): boolean {
  if (feedbackLabel === null) return optionLabel === "correct";
  return feedbackLabel === optionLabel;
}

/**
 * Skip a no-op re-POST when this label is already persisted and the note
 * is unchanged. Does not block first save or label changes.
 */
export function shouldSkipFeedbackResubmit(opts: {
  label: FeedbackLabel;
  serverLabel: FeedbackLabel | null;
  noteDirty: boolean;
}): boolean {
  if (opts.noteDirty) return false;
  return opts.serverLabel === opts.label;
}

/** Optimistic Feedback chrome transitions — select / Neon rollback / server reconcile. */
export type FeedbackChromeEvent =
  | { type: "select"; label: FeedbackLabel }
  | { type: "rollback"; previous: FeedbackLabel | null }
  | { type: "reconcile"; serverLabel: FeedbackLabel | null };

export function reduceFeedbackChromeLabel(
  _current: FeedbackLabel | null,
  event: FeedbackChromeEvent,
): FeedbackLabel | null {
  switch (event.type) {
    case "select":
      return event.label;
    case "rollback":
      return event.previous;
    case "reconcile":
      return event.serverLabel;
  }
}

export function FeedbackControls({
  signal,
  triage,
  conversationId,
  groundTruth,
  className,
}: {
  signal: Signal;
  triage?: SignalReviewTriage;
  /** When set, mounts Ground Truth picker in the Feedback header. */
  conversationId?: string;
  groundTruth?: SignalType | "none";
  className?: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  /** Sync guard — `pending` state is too slow and allowed double POSTs. */
  const inflightRef = useRef(false);
  const headingId = useId();
  const noteId = useId();
  const initialNote = signal.feedback?.note ?? "";
  const serverLabel = signal.feedback?.label ?? null;
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState<FeedbackLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Local chrome (optimistic select + post-save bridge until Neon hydrates). */
  const [localLabel, setLocalLabel] = useState<FeedbackLabel | null>(
    serverLabel,
  );
  const [prevServerKey, setPrevServerKey] = useState(
    () => `${signal.id}:${serverLabel ?? ""}`,
  );
  const [savedAnnounce, setSavedAnnounce] = useState<FeedbackLabel | null>(
    null,
  );
  const dirty = note.trim() !== initialNote.trim();

  const serverKey = `${signal.id}:${serverLabel ?? ""}`;
  if (serverKey !== prevServerKey) {
    setPrevServerKey(serverKey);
    setLocalLabel(
      reduceFeedbackChromeLabel(localLabel, {
        type: "reconcile",
        serverLabel,
      }),
    );
    setNote(initialNote);
    setSavedAnnounce(null);
  }

  const feedbackLabel = localLabel;
  const busy = pending !== null;
  const needsAdapt =
    feedbackLabel === "incorrect" || feedbackLabel === "partially_correct";
  const currentTitle =
    options.find((o) => o.label === feedbackLabel)?.title ??
    feedbackLabel?.replaceAll("_", " ");

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const submit = useCallback(
    async (label: FeedbackLabel) => {
      if (inflightRef.current) return;
      if (
        shouldSkipFeedbackResubmit({
          label,
          serverLabel,
          noteDirty: dirty,
        })
      ) {
        return;
      }
      const wasPending = !signal.feedback;
      const previous = localLabel;
      // Instant pressed + chip; Neon POST runs in the background.
      inflightRef.current = true;
      setLocalLabel(
        reduceFeedbackChromeLabel(localLabel, { type: "select", label }),
      );
      setPending(label);
      setError(null);
      setSavedAnnounce(null);
      try {
        await postSignalFeedback(signal, label, note);
        setSavedAnnounce(label);
        emitFeedbackSaved(signal.id, label);

        const advanceHref =
          triage?.isPendingReview && wasPending
            ? label === "correct"
              ? correctAdvanceHref({
                  nextPendingPreviewId: triage.nextPendingPreviewId,
                  scoreFrom: triage.scoreFrom,
                  mode: triage.mode,
                  replaced: triage.replaced,
                  typeFilter: triage.typeFilter,
                  actionFilter: triage.actionFilter,
                  file: triage.file,
                })
              : afterFeedbackHref({
                  wasPending: true,
                  label,
                  currentSignalId: signal.id,
                  nextPendingPreviewId: triage.nextPendingPreviewId,
                  scoreFrom: triage.scoreFrom,
                  mode: triage.mode,
                  replaced: triage.replaced,
                  typeFilter: triage.typeFilter,
                  actionFilter: triage.actionFilter,
                  file: triage.file,
                })
            : null;

        // Drop stale navigation if this panel already unmounted (signal walk).
        if (panelRef.current == null) return;

        if (advanceHref) {
          router.push(advanceHref, { scroll: false });
        } else {
          router.refresh();
        }
      } catch (err) {
        setLocalLabel(
          reduceFeedbackChromeLabel(localLabel, {
            type: "rollback",
            previous,
          }),
        );
        setError(err instanceof Error ? err.message : "Failed to save feedback");
      } finally {
        inflightRef.current = false;
        setPending(null);
      }
    },
    [dirty, localLabel, note, router, serverLabel, signal, triage],
  );

  useEffect(() => {
    const keyboardRoot =
      panelRef.current?.closest("[data-review-keyboard-root]") ??
      panelRef.current;
    if (!keyboardRoot) return;
    const el: Element = keyboardRoot;

    const onKeyDown = (e: Event) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (inflightRef.current || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!el.contains(e.target as Node)) return;
      if (isEditableShortcutTarget(e.target)) return;
      const label = feedbackLabelForShortcutKey(e.key);
      if (!label) return;
      e.preventDefault();
      void submit(label);
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [submit]);

  function onNoteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
    e.preventDefault();
    if (busy) return;
    void submit("correct");
  }

  const actionButtons = (
    <TooltipProvider>
    <div
      className="grid min-w-0 grid-cols-3 gap-2"
      role="group"
      aria-label="Feedback actions"
    >
      {options.map((option) => {
        const isCurrent = feedbackLabel === option.label;
        const isPrimary = isFeedbackPrimaryChrome(
          option.label,
          feedbackLabel,
        );
        const { Icon } = option;
        return (
          <Tooltip key={option.label}>
          <TooltipTrigger asChild>
          <Button
            type="button"
            variant={isPrimary ? "default" : "outline"}
            size="lg"
            disabled={busy}
            aria-busy={pending === option.label}
            aria-pressed={isCurrent}
            aria-keyshortcuts={option.shortcut}
            onClick={() => void submit(option.label)}
            className={cn(
              isPrimary ? primaryBtn : outlineBtn,
              "min-w-0",
              option.label === "partially_correct" && "@container/feedback",
              busy && "cursor-wait",
            )}
          >
            {pending === option.label ? (
              <ButtonSpinner data-icon="inline-start" />
            ) : (
              <Icon data-icon="inline-start" />
            )}
            <span className="min-w-0 leading-none">
              {option.label === "partially_correct" ? (
                <>
                  {/* Button is the container. A viewport breakpoint still showed the long label in the narrow review rail and clipped the icon. */}
                  <span className="@min-[12rem]/feedback:hidden">Partial</span>
                  <span className="hidden @min-[12rem]/feedback:inline">
                    {option.title}
                  </span>
                </>
              ) : (
                option.title
              )}
            </span>
          </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {`${option.hint} (${option.shortcut})`}
          </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
    </TooltipProvider>
  );

  return (
    <Card
      ref={panelRef}
      size="sm"
      data-review-slot="feedback"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title="Feedback">
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <InsightsReviewStatusChip
            className={FEEDBACK_CHIP[feedbackLabel ?? "pending"]}
          >
            {currentTitle ?? "Pending"}
          </InsightsReviewStatusChip>
          {conversationId ? (
            <GroundTruthControl
              conversationId={conversationId}
              groundTruth={groundTruth}
              defaultType={signal.type}
            />
          ) : null}
        </div>
      </InsightsReviewPaneHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col px-0">
        <div
          className={cn(
            evalCardPadClassName,
            "flex min-h-0 flex-1 flex-col gap-2.5 py-3",
          )}
        >
          <p className="sr-only" aria-live="polite">
            {busy
              ? "Saving…"
              : savedAnnounce
                ? `${options.find((o) => o.label === savedAnnounce)?.title ?? savedAnnounce} saved`
                : null}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId} className="sr-only">
              Optional note
            </Label>
            <Input
              id={noteId}
              type="text"
              name="feedbackNote"
              autoComplete="off"
              spellCheck={false}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onNoteKeyDown}
              placeholder="Optional note — e.g. ops language, not churn…"
              className="min-h-9 border-sio-border-subtle bg-sio-bg-base text-base text-sio-fg-base placeholder:text-sio-fg-muted"
            />
          </div>

          {actionButtons}

          {needsAdapt ? (
            <div role="status" aria-live="polite">
              <InsightsReviewHelperNote
                action={
                  <Button
                    asChild
                    variant="outline"
                    size="default"
                    className="h-8 gap-2 shrink-0"
                  >
                    <Link href={viewHref("eval", { panel: "adapt" })}>
                      Adapt From Reviews
                    </Link>
                  </Button>
                }
              >
                {ADAPT_NOTE_HELPER}
              </InsightsReviewHelperNote>
            </div>
          ) : null}

          {error ? (
            <p className="text-label-12 text-sio-status-danger-fg" role="alert">
              {error}. Try again or refresh the page.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
