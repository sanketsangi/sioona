"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { storedOutcome, type ReportOutcome } from "@/lib/revenue-leak";
import {
  commercialOutcomeForShortcutKey,
  isEditableShortcutTarget,
} from "@/lib/review-triage";

const OPTIONS: { outcome: ReportOutcome; label: string }[] = [
  { outcome: "saved", label: "Saved" },
  { outcome: "lost", label: "Lost" },
  { outcome: "converted", label: "Converted" },
];

export function RevenueLeakOutcomeButtons({
  signalId,
  backendSignalId,
  valueInr,
  current,
  listenKeyboard = false,
}: {
  signalId: string;
  backendSignalId?: string;
  valueInr: number | null;
  current: ReportOutcome | null;
  /** Review pane: 1 Saved, 2 Lost, 3 Converted. */
  listenKeyboard?: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<ReportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (outcome: ReportOutcome) => {
      if (pending) return;
      setPending(outcome);
      setError(null);
      try {
        const response = await fetch(
          `/api/signals/${encodeURIComponent(signalId)}/outcome`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              outcome: storedOutcome(outcome),
              valueInr,
              backendSignalId,
            }),
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Could not save the outcome");
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the outcome");
      } finally {
        setPending(null);
      }
    },
    [backendSignalId, pending, router, signalId, valueInr],
  );

  useEffect(() => {
    if (!listenKeyboard) return;
    const keyboardRoot =
      rootRef.current?.closest("[data-review-keyboard-root]") ?? rootRef.current;
    if (!keyboardRoot) return;
    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (pending || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!keyboardRoot.contains(event.target as Node)) return;
      if (isEditableShortcutTarget(event.target)) return;
      const outcome = commercialOutcomeForShortcutKey(event.key);
      if (!outcome) return;
      event.preventDefault();
      void save(outcome);
    };
    keyboardRoot.addEventListener("keydown", onKeyDown);
    return () => keyboardRoot.removeEventListener("keydown", onKeyDown);
  }, [listenKeyboard, pending, save]);

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-1">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Record outcome. 1 Saved, 2 Lost, 3 Converted. Nothing is sent."
      >
        {OPTIONS.map((option) => {
          const selected = current === option.outcome;
          return (
            <Button
              key={option.outcome}
              type="button"
              variant={selected ? "default" : "outline"}
              size="lg"
              aria-pressed={selected}
              aria-busy={pending === option.outcome}
              disabled={pending != null}
              onClick={() => void save(option.outcome)}
            >
              {pending === option.outcome ? "Saving…" : option.label}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
