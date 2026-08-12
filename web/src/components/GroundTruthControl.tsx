"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SignalType } from "@/lib/types";

const OPTIONS: Array<{ value: SignalType | "none" | ""; label: string }> = [
  { value: "", label: "Unset" },
  { value: "lead", label: "Lead" },
  { value: "retention", label: "Retention" },
  { value: "upsell", label: "Upsell" },
  { value: "none", label: "None" },
];

export function GroundTruthControl({
  conversationId,
  groundTruth,
}: {
  conversationId: string;
  groundTruth?: SignalType | "none";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(groundTruth ?? "");
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    setValue(next);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/ground-truth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groundTruth: next === "" ? null : next,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save ground truth");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save ground truth"
      );
    }
  }

  return (
    <section
      className="panel p-4 sm:p-5"
      aria-labelledby={`ground-truth-heading-${conversationId}`}
    >
      <h3
        id={`ground-truth-heading-${conversationId}`}
        className="text-heading-16 text-ds-gray-1000"
      >
        Set Ground Truth
      </h3>
      <p className="mt-1 max-w-prose text-pretty text-copy-14 text-ds-gray-900">
        Label this conversation for labeled precision/recall on partner chats.
      </p>
      <label className="mt-4 block">
        <span className="text-label-12 text-ds-gray-900">Ground Truth</span>
        <select
          name="groundTruth"
          autoComplete="off"
          className="input-field mt-1 w-full max-w-xs bg-ds-background-100 text-ds-gray-1000"
          value={value}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
        >
          {OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="mt-2 text-copy-14 text-ds-red-900" role="alert">
          {error}. Try again or refresh the page.
        </p>
      ) : null}
      <div aria-live="polite">
        {pending ? (
          <p className="mt-2 text-copy-14 text-ds-gray-900">Saving…</p>
        ) : null}
      </div>
    </section>
  );
}
