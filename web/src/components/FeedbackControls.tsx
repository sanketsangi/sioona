"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { viewHref } from "@/lib/views";
import type { FeedbackLabel, Signal } from "@/lib/types";

const options: { label: FeedbackLabel; title: string; hint: string }[] = [
  {
    label: "accept",
    title: "Accept Signal",
    hint: "Signal is correct and useful",
  },
  {
    label: "reject",
    title: "Reject Signal",
    hint: "Not a real opportunity",
  },
  {
    label: "wrong_reason",
    title: "Wrong Reason",
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
    feedbackLabel === "reject" || feedbackLabel === "wrong_reason";

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
      void submit("accept");
    }
  }

  return (
    <div className="panel p-4 sm:p-5">
      <h2 className="text-heading-16 text-ds-gray-1000">SignalScore Feedback</h2>
      <p className="mt-1 text-label-13 text-ds-gray-900">
        Accept / reject / wrong reason — used for precision tracking and
        taxonomy adaptation.
      </p>
      <div aria-live="polite">
        {signal.feedback ? (
          <p className="mt-3 text-copy-14 text-ds-blue-900">
            Current: {signal.feedback.label.replace("_", " ")}
            {signal.feedback.note ? ` — ${signal.feedback.note}` : ""}
          </p>
        ) : null}
      </div>
      <label className="mt-4 block">
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
      <p className="mt-1 text-label-12 text-ds-gray-900">
        ⌘&nbsp;Enter or Ctrl&nbsp;Enter accepts with the current note.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={pending !== null}
            aria-busy={pending === option.label}
            onClick={() => submit(option.label)}
            className="choice-btn"
          >
            <div className="flex items-center gap-1.5 text-label-14 font-medium text-ds-gray-1000">
              {pending === option.label ? <ButtonSpinner /> : null}
              {option.title}
            </div>
            <div className="mt-0.5 text-label-12 text-ds-gray-900">
              {option.hint}
            </div>
          </button>
        ))}
      </div>
      {needsAdapt ? (
        <div
          className="surface-quiet mt-4 px-3 py-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-copy-14 text-ds-gray-1000">
            {feedbackLabel === "reject"
              ? "False positive? Add a negative phrase so this pattern stops firing."
              : "Wrong rationale? Add the phrase that should drive this signal type."}
          </p>
          <Link
            href={viewHref("eval", { panel: "adapt" })}
            className="btn-secondary mt-3"
          >
            Adapt From Reviews
          </Link>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-copy-14 text-ds-red-900" role="alert">
          {error}. Try again or refresh the page.
        </p>
      ) : null}
    </div>
  );
}
