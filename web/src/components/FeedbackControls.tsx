"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { CrossCircleIcon } from "@/components/icons/CrossCircleIcon";
import { GoodIcon } from "@/components/icons/GoodIcon";
import { WarningIcon } from "@/components/icons/WarningIcon";
import { Note, NoteAction, NoteContent } from "@/components/ui/Note";
import { viewHref } from "@/lib/views";
import type { FeedbackLabel, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

const options: {
  label: FeedbackLabel;
  title: string;
  hint: string;
  primary?: boolean;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  {
    label: "correct",
    title: "Correct",
    hint: "Signal is correct and useful",
    primary: true,
    Icon: GoodIcon,
  },
  {
    label: "incorrect",
    title: "Incorrect",
    hint: "Not a real opportunity",
    Icon: CrossCircleIcon,
  },
  {
    label: "partially_correct",
    title: "Partially Correct",
    hint: "Right-ish signal, bad rationale",
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

export function FeedbackControls({
  signal,
  className,
}: {
  signal: Signal;
  className?: string;
}) {
  const router = useRouter();
  const headingId = useId();
  const noteRef = useRef<HTMLInputElement>(null);
  const initialNote = signal.feedback?.note ?? "";
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState<FeedbackLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<FeedbackLabel | null>(null);
  const dirty = note.trim() !== initialNote.trim();

  const feedbackLabel = signal.feedback?.label ?? justSaved;
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

  async function submit(label: FeedbackLabel) {
    setPending(label);
    setError(null);
    try {
      const res = await fetch(`/api/signals/${signal.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        if (res.status === 503) {
          throw new Error(
            data.error ||
              "Signal Score backend unavailable — feedback not saved",
          );
        }
        throw new Error(data.error || "Failed to save feedback");
      }
      setJustSaved(label);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setPending(null);
    }
  }

  function onNoteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
    e.preventDefault();
    if (pending !== null) return;
    void submit("correct");
  }

  return (
    <section
      className={cn("metric-strip flex flex-col", className)}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sio-border-base px-3 py-2">
        <h3 id={headingId} className="eyebrow">
          Feedback
        </h3>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-label-12 font-medium",
            FEEDBACK_CHIP[feedbackLabel ?? "pending"],
          )}
          translate="no"
        >
          {currentTitle ?? "Pending"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <p className="text-label-12 text-sio-fg-muted">
          Mark Correct, Incorrect, or Partially Correct. Saves to Neon. Enter →
          Correct.
        </p>
        <p className="sr-only" aria-live="polite">
          {justSaved
            ? `${options.find((o) => o.label === justSaved)?.title ?? justSaved} saved`
            : null}
        </p>

        <label className="mt-2.5 block">
          <span className="sr-only">Optional note</span>
          <input
            ref={noteRef}
            type="text"
            name="feedbackNote"
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onNoteKeyDown}
            placeholder="Optional note -- e.g. ops language, not churn…"
            className="input-field"
          />
        </label>

        <div
          className="mt-2.5 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Feedback actions"
        >
          {options.map((option) => {
            const isCurrent = feedbackLabel === option.label;
            const { Icon } = option;
            return (
              <button
                key={option.label}
                type="button"
                title={option.hint}
                disabled={pending !== null}
                aria-busy={pending === option.label}
                aria-pressed={isCurrent}
                onClick={() => submit(option.label)}
                className={cn(
                  option.primary ? "btn-primary" : "btn-secondary",
                  isCurrent &&
                    !option.primary &&
                    "border-sio-border-strong bg-sio-bg-interactive-hover",
                )}
              >
                {pending === option.label ? (
                  <ButtonSpinner />
                ) : (
                  <Icon className="size-3.5 shrink-0" />
                )}
                {option.title}
              </button>
            );
          })}
        </div>

        {needsAdapt ? (
          <div className="mt-2.5" role="status" aria-live="polite">
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
                <Link
                  href={viewHref("eval", { panel: "adapt" })}
                  className="btn-secondary"
                >
                  Adapt From Reviews
                </Link>
              </NoteAction>
            </Note>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-2.5 text-label-12 text-sio-status-danger-fg"
            role="alert"
          >
            {error}. Try again or refresh the page.
          </p>
        ) : null}
      </div>
    </section>
  );
}
