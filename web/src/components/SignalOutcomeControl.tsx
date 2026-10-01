"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ButtonSpinner } from "@/components/ButtonSpinner";
import type { Signal, SignalOutcome } from "@/lib/types";

const OPTIONS: { value: SignalOutcome; label: string }[] = [
  { value: "retained", label: "Retained" },
  { value: "churned", label: "Churned" },
  { value: "converted", label: "Converted" },
  { value: "no_change", label: "No change" },
  { value: "unknown", label: "Unknown" },
];

export function SignalOutcomeControl({ signal }: { signal: Signal }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<SignalOutcome>(
    signal.outcome?.outcome ?? "unknown",
  );
  const [valueInr, setValueInr] = useState(
    signal.outcome?.valueInr != null ? String(signal.outcome.valueInr) : "",
  );
  const [recordedOn, setRecordedOn] = useState(
    signal.outcome?.recordedAt?.slice(0, 10) ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const res = await fetch(`/api/signals/${encodeURIComponent(signal.id)}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          valueInr: valueInr.trim() === "" ? null : Number(valueInr),
          recordedOn: recordedOn || null,
          backendSignalId: signal.backendSignalId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not save the outcome.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not save the outcome.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 border-t border-sio-border-base pt-3">
      <p className="text-label-12 text-sio-fg-muted">Outcome</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[9rem] flex-col gap-1 text-label-12 text-sio-fg-muted">
          What happened
          <select
            name="outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as SignalOutcome)}
            className="input-field text-base"
            disabled={pending}
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-28 flex-col gap-1 text-label-12 text-sio-fg-muted">
          ₹ value
          <input
            name="valueInr"
            inputMode="decimal"
            value={valueInr}
            onChange={(event) => setValueInr(event.target.value)}
            placeholder="Optional…"
            className="input-field text-base tabular"
            disabled={pending}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-label-12 text-sio-fg-muted">
          Date
          <input
            name="recordedOn"
            type="date"
            value={recordedOn}
            onChange={(event) => setRecordedOn(event.target.value)}
            className="input-field text-base"
            disabled={pending}
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={pending}>
          {pending ? <ButtonSpinner /> : null}
          Save outcome
        </button>
      </div>
      <p className="mt-1 text-label-12 text-sio-fg-subtle" aria-live="polite">
        {error ? (
          <span role="alert" className="text-sio-status-danger-fg">
            {error}
          </span>
        ) : saved ? (
          "Saved."
        ) : (
          "Optional rupee amount feeds revenue at risk and revenue saved on Eval."
        )}
      </p>
    </form>
  );
}
