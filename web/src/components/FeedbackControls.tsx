"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { viewHref } from "@/lib/views";
import type { FeedbackLabel, Signal } from "@/lib/types";

const options: { label: FeedbackLabel; title: string; hint: string }[] = [
  {
    label: "correct",
    title: "Correct",
    hint: "Signal is correct and useful",
  },
  {
    label: "incorrect",
    title: "Incorrect",
    hint: "Not a real opportunity",
  },
  {
    label: "partially_correct",
    title: "Partially Correct",
    hint: "Right-ish signal, bad rationale",
  },
];

export function FeedbackControls({ signal }: { signal: Signal }) {
  const router = useRouter();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const initialNote = signal.feedback?.note ?? "";
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState<FeedbackLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<FeedbackLabel | null>(null);
  const dirty = note.trim() !== initialNote.trim();

  const feedbackLabel = signal.feedback?.label ?? justSaved;
  const needsAdapt =
    feedbackLabel === "incorrect" || feedbackLabel === "partially_correct";

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
              "Signal Score backend unavailable — feedback not saved"
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

  function onNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit("correct");
    }
  }

  return (
    <div className="panel p-3.5 sm:p-4">
      <h2 className="text-heading-16 text-sio-fg-base">Feedback</h2>
      <p className="mt-1 text-label-13 text-sio-fg-muted">
        Mark correct / incorrect / partially correct. Saves to Neon and
        refreshes Signal Score above.
      </p>
      <div aria-live="polite">
        {signal.feedback || justSaved ? (
          <p className="mt-2.5 break-words text-copy-14 text-sio-fg-base">
            Current:{" "}
            <span className="font-medium">
              {(signal.feedback?.label ?? justSaved)!.replaceAll("_", " ")}
            </span>
            {signal.feedback?.note ? (
              <span className="text-sio-fg-muted">
                {" "}
                — {signal.feedback.note}
              </span>
            ) : null}
            {justSaved && !signal.feedback
              ? " — saved; score refreshing…"
              : null}
          </p>
        ) : null}
      </div>
      <label className="mt-3.5 block">
        <span className="sr-only">Optional note</span>
        <textarea
          ref={noteRef}
          name="feedbackNote"
          autoComplete="off"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onNoteKeyDown}
          placeholder="Optional note — e.g. ops language, not churn…"
          className="input-field min-h-[64px] text-base sm:text-sm"
          rows={2}
        />
      </label>
      <p className="mt-1 text-label-12 text-sio-fg-muted">
        ⌘&nbsp;Enter or Ctrl&nbsp;Enter marks correct with the current note.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={pending !== null}
            aria-busy={pending === option.label}
            onClick={() => submit(option.label)}
            className="min-h-11 rounded-sm border border-sio-border-base bg-sio-bg-base px-3 py-2.5 text-left transition-colors duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
          >
            <div className="flex items-center gap-1.5 text-label-14 font-medium text-sio-fg-base">
              {pending === option.label ? <ButtonSpinner /> : null}
              {option.title}
            </div>
            <div className="mt-0.5 text-label-12 text-sio-fg-muted">
              {option.hint}
            </div>
          </button>
        ))}
      </div>
      {needsAdapt ? (
        <div
          className="mt-3.5 rounded-sm border border-sio-border-base bg-sio-bg-muted px-3 py-2.5"
          role="status"
          aria-live="polite"
        >
          <p className="text-copy-14 text-sio-fg-base">
            {feedbackLabel === "incorrect"
              ? "False positive? Add a negative phrase so this pattern stops firing."
              : "Wrong rationale? Add the phrase that should drive this signal type."}
          </p>
          <Link
            href={viewHref("eval", { panel: "adapt" })}
            className="btn-secondary mt-2.5"
          >
            Adapt From Reviews
          </Link>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-copy-14 text-sio-status-danger-fg" role="alert">
          {error}. Try again or refresh the page.
        </p>
      ) : null}
    </div>
  );
}
