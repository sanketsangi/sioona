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
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
import { CrossCircleIcon } from "@/components/icons/CrossCircleIcon";
import { GoodIcon } from "@/components/icons/GoodIcon";
import { WarningIcon } from "@/components/icons/WarningIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Note, NoteAction, NoteContent } from "@/components/ui/Note";
import { emitFeedbackSaved } from "@/lib/feedback-saved";
import {
  feedbackLabelForShortcutKey,
  isEditableShortcutTarget,
} from "@/lib/review-triage";
import { postSignalFeedback } from "@/lib/signal-feedback-client";
import type { FeedbackLabel, Signal } from "@/lib/types";
import { afterFeedbackHref, viewHref, type SignalReviewTriage } from "@/lib/views";
import { cn } from "@/lib/utils";

const options: {
  label: FeedbackLabel;
  title: string;
  hint: string;
  shortcut: string;
  primary?: boolean;
  Icon: ComponentType<{ className?: string; "data-icon"?: string }>;
}[] = [
  {
    label: "correct",
    title: "Correct",
    hint: "Signal is correct and useful",
    shortcut: "C",
    primary: true,
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

/** Header chip chrome — same shell as GroundTruthControl STATUS_CHIP. */
const FEEDBACK_CHIP: Record<FeedbackLabel | "pending", string> = {
  pending: "bg-sio-bg-muted text-sio-fg-muted",
  correct: "bg-sio-status-success-bg text-sio-status-success-fg",
  incorrect: "bg-sio-status-danger-bg text-sio-status-danger-fg",
  partially_correct: "bg-sio-status-warning-bg text-sio-status-warning-fg",
};

const outlineBtn =
  "min-h-11 w-full touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive md:min-h-9";
const primaryBtn =
  "min-h-11 w-full touch-manipulation bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90 md:min-h-9";

export function FeedbackControls({
  signal,
  triage,
  className,
}: {
  signal: Signal;
  triage?: SignalReviewTriage;
  className?: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const noteId = useId();
  const initialNote = signal.feedback?.note ?? "";
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState<FeedbackLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<FeedbackLabel | null>(null);
  const dirty = note.trim() !== initialNote.trim();

  const feedbackLabel = signal.feedback?.label ?? justSaved;
  const busy = pending !== null;
  const needsAdapt =
    feedbackLabel === "incorrect" || feedbackLabel === "partially_correct";
  const currentTitle =
    options.find((o) => o.label === feedbackLabel)?.title ??
    feedbackLabel?.replaceAll("_", " ");
  const canAdvance = Boolean(triage?.isPendingReview && !signal.feedback);
  const isUnactedCorrect =
    feedbackLabel === "correct" && signal.status !== "acted";

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
      const wasPending = !signal.feedback;
      setPending(label);
      setError(null);
      try {
        await postSignalFeedback(signal, label, note);
        setJustSaved(label);
        emitFeedbackSaved(signal.id);

        const advanceHref =
          triage?.isPendingReview && wasPending
            ? afterFeedbackHref({
                wasPending: true,
                label,
                currentSignalId: signal.id,
                nextPendingPreviewId: triage.nextPendingPreviewId,
                scoreFrom: triage.scoreFrom,
                mode: triage.mode,
                replaced: triage.replaced,
              })
            : null;

        if (advanceHref) {
          router.push(advanceHref, { scroll: false });
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save feedback");
      } finally {
        setPending(null);
      }
    },
    [note, router, signal, triage],
  );

  useEffect(() => {
    const keyboardRoot =
      panelRef.current?.closest("[data-review-keyboard-root]") ??
      panelRef.current;
    if (!keyboardRoot) return;
    const el: Element = keyboardRoot;

    const onKeyDown = (e: Event) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (pending !== null || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!el.contains(e.target as Node)) return;
      if (isEditableShortcutTarget(e.target)) return;
      const label = feedbackLabelForShortcutKey(e.key);
      if (!label) return;
      e.preventDefault();
      void submit(label);
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [pending, submit]);

  function onNoteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
    e.preventDefault();
    if (busy) return;
    void submit("correct");
  }

  return (
    <Card
      ref={panelRef}
      size="sm"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title="Feedback">
        <InsightsReviewStatusChip
          className={FEEDBACK_CHIP[feedbackLabel ?? "pending"]}
        >
          {currentTitle ?? "Pending"}
        </InsightsReviewStatusChip>
      </InsightsReviewPaneHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col px-0">
        <div
          className={cn(
            evalCardPadClassName,
            "flex min-h-0 flex-1 flex-col gap-2.5 py-3",
          )}
        >
          <p className="text-pretty text-copy-14 text-sio-fg-subtle">
            {canAdvance
              ? "C → Follow-up Act · I / P → next pending · Enter → Correct."
              : isUnactedCorrect
                ? "Copy Reply, then A / Enter → Mark as Acted (does not send)."
                : "C / I / P shortcuts · Enter → Correct · saves to Neon."}
          </p>
          <p className="sr-only" aria-live="polite">
            {justSaved
              ? `${options.find((o) => o.label === justSaved)?.title ?? justSaved} saved`
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
              className="min-h-11 border-sio-border-subtle bg-sio-bg-base text-sio-fg-base placeholder:text-sio-fg-muted md:min-h-9"
            />
          </div>

          <div
            className="grid grid-cols-3 gap-2"
            role="group"
            aria-label="Feedback actions"
          >
            {options.map((option) => {
              const isCurrent = feedbackLabel === option.label;
              const { Icon } = option;
              return (
                <Button
                  key={option.label}
                  type="button"
                  variant={option.primary ? "default" : "outline"}
                  size="lg"
                  title={`${option.hint} (${option.shortcut})`}
                  disabled={busy}
                  aria-busy={pending === option.label}
                  aria-pressed={isCurrent}
                  aria-keyshortcuts={option.shortcut}
                  onClick={() => void submit(option.label)}
                  className={cn(
                    option.primary ? primaryBtn : outlineBtn,
                    isCurrent &&
                      !option.primary &&
                      "border-sio-border-strong bg-sio-bg-interactive-hover",
                  )}
                >
                  {pending === option.label ? (
                    <ButtonSpinner data-icon="inline-start" />
                  ) : (
                    <Icon
                      data-icon="inline-start"
                      className={
                        option.label === "partially_correct"
                          ? "-translate-y-[2px]"
                          : undefined
                      }
                    />
                  )}
                  <span className="leading-none">
                    {option.label === "partially_correct" ? (
                      <>
                        <span className="min-[420px]:hidden">Partial</span>
                        <span className="hidden min-[420px]:inline">
                          {option.title}
                        </span>
                      </>
                    ) : (
                      option.title
                    )}
                  </span>
                </Button>
              );
            })}
          </div>

          {needsAdapt ? (
            <div role="status" aria-live="polite">
              <Note
                icon={null}
                className="rounded-md border-sio-border-base bg-sio-bg-muted px-2.5 py-2"
              >
                <NoteContent className="text-label-12 text-sio-fg-base">
                  {feedbackLabel === "incorrect"
                    ? "False positive? Add a negative phrase so this pattern stops firing."
                    : "Wrong rationale? Add the phrase that should drive this signal type."}
                </NoteContent>
                <NoteAction>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="min-h-11 touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive md:min-h-9"
                  >
                    <Link href={viewHref("eval", { panel: "adapt" })}>
                      Adapt From Reviews
                    </Link>
                  </Button>
                </NoteAction>
              </Note>
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
