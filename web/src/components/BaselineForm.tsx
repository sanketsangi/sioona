"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";

export function BaselineForm({
  baselineOpportunities,
  baselineNote,
  compact = false,
}: {
  baselineOpportunities: number;
  baselineNote?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const countRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(baselineOpportunities));
  const [note, setNote] = useState(baselineNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    value.trim() !== String(baselineOpportunities) ||
    note.trim() !== (baselineNote ?? "").trim();

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const n = Number(value.trim());
    if (!Number.isFinite(n) || n < 0 || value.trim() === "") {
      setError("Enter a non-negative number for the baseline count.");
      countRef.current?.focus();
      return;
    }

    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_baseline",
          baselineOpportunities: n,
          baselineNote: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save baseline");
      }
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. Check the count and try again.`
          : "Failed to save baseline. Try again."
      );
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`panel ${compact ? "px-3 py-3 sm:px-4" : "p-4 sm:p-5"} ${compact ? "" : "mt-4"}`}
    >
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${compact ? "" : "mb-1"}`}
      >
        <h2 className="text-balance text-heading-16 text-sio-fg-base">
          Set Partner Baseline
        </h2>
        {compact ? (
          <p className="text-label-12 text-sio-fg-muted">
            Lift = Sioona − baseline
          </p>
        ) : null}
      </div>
      {!compact ? (
        <p className="mt-1 max-w-2xl text-pretty text-copy-14 text-sio-fg-subtle">
          Opportunities they find today. Lift = Sioona − baseline.
        </p>
      ) : null}
      <div
        className={`grid gap-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(12rem,2fr)_auto] sm:items-end ${compact ? "mt-2.5" : "mt-4"}`}
      >
        <label className="block min-w-0">
          <span className="text-label-12 text-sio-fg-muted">
            Baseline Count
          </span>
          <input
            ref={countRef}
            type="text"
            inputMode="numeric"
            name="baselineOpportunities"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input-field mt-1 w-full"
            disabled={pending}
            placeholder="0…"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-label-12 text-sio-fg-muted">
            Note (optional)
          </span>
          <input
            type="text"
            name="baselineNote"
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. weekly Intercom opportunities…"
            className="input-field mt-1 w-full"
            disabled={pending}
          />
        </label>
        <button
          type="submit"
          className="btn-primary w-full sm:w-auto"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <ButtonSpinner /> : null}
          Save Baseline
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-copy-14 text-sio-status-danger-fg" role="alert">
          {error}
        </p>
      ) : null}
      <div aria-live="polite">
        {saved ? (
          <p className="mt-2 text-copy-14 text-sio-status-success-fg">
            Baseline saved.
          </p>
        ) : null}
      </div>
    </form>
  );
}
