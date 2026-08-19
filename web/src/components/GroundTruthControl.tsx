"use client";

import { useRouter } from "next/navigation";
import {
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { StopIcon } from "@/components/icons/StopIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

type GroundTruthValue = SignalType | "none" | "";

const OPTIONS: Array<{
  value: GroundTruthValue;
  label: string;
  hint: string;
  Icon?: ComponentType<{ className?: string }>;
}> = [
  { value: "", label: "Unset", hint: "No ground truth label" },
  { value: "lead", label: "Lead", hint: "Labeled as Lead", Icon: LeadIcon },
  {
    value: "retention",
    label: "Retention",
    hint: "Labeled as Retention",
    Icon: RetentionIcon,
  },
  {
    value: "upsell",
    label: "Upsell",
    hint: "Labeled as Upsell",
    Icon: UpsellIcon,
  },
  {
    value: "none",
    label: "None",
    hint: "Explicitly no signal",
    Icon: StopIcon,
  },
];

/** Class literals live here so Tailwind content scan picks them up (not only via lib/). */
const STATUS_CHIP: Record<GroundTruthValue, string> = {
  "": "bg-sio-bg-muted text-sio-fg-muted",
  none: "bg-sio-bg-interactive-hover text-sio-fg-base",
  lead: "bg-sio-signal-lead-bg text-sio-signal-lead-fg",
  retention: "bg-sio-signal-retention-bg text-sio-signal-retention-fg",
  upsell: "bg-sio-signal-upsell-bg text-sio-signal-upsell-fg",
};

function statusLabel(value: GroundTruthValue): string {
  return OPTIONS.find((o) => o.value === value)?.label ?? "Unset";
}

export function GroundTruthControl({
  conversationId,
  groundTruth,
  className,
}: {
  conversationId: string;
  groundTruth?: SignalType | "none";
  className?: string;
}) {
  const router = useRouter();
  const headingId = useId();
  const groupId = useId();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<GroundTruthValue>(groundTruth ?? "");
  const [prevGroundTruth, setPrevGroundTruth] = useState(groundTruth);
  const [error, setError] = useState<string | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (groundTruth !== prevGroundTruth) {
    setPrevGroundTruth(groundTruth);
    setValue(groundTruth ?? "");
  }

  async function onSelect(next: GroundTruthValue) {
    if (next === value || pending) return;
    const previous = value;
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
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save ground truth");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setValue(previous);
      setError(
        err instanceof Error ? err.message : "Failed to save ground truth",
      );
    }
  }

  function onRadioKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = OPTIONS.length - 1;
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = index === last ? 0 : index + 1;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = index === 0 ? last : index - 1;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = last;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    optionRefs.current[nextIndex]?.focus();
    void onSelect(OPTIONS[nextIndex].value);
  }

  return (
    <section
      className={cn("metric-strip flex flex-col", className)}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sio-border-base px-3 py-2">
        <h3
          id={headingId}
          className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
        >
          Ground Truth
        </h3>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-label-12 font-medium",
            STATUS_CHIP[value],
          )}
          translate="no"
        >
          {statusLabel(value)}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <div className="mt-auto flex flex-col gap-2.5">
          <p className="text-label-12 text-sio-fg-muted">
            Label this conversation so Eval can compute labeled precision and
            recall for Lead, Retention, Upsell, or None.
          </p>

          <div
            id={groupId}
            role="radiogroup"
            aria-labelledby={headingId}
            aria-disabled={pending || undefined}
            className="flex flex-wrap items-center gap-2"
          >
            {OPTIONS.map((opt, index) => {
              const selected = value === opt.value;
              const { Icon } = opt;
              return (
                <button
                  key={opt.label}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={opt.hint}
                  tabIndex={selected ? 0 : -1}
                  disabled={pending}
                  aria-busy={pending && selected}
                  onClick={() => void onSelect(opt.value)}
                  onKeyDown={(e) => onRadioKeyDown(e, index)}
                  className={cn(
                    selected ? "btn-primary" : "btn-secondary",
                    pending && "cursor-wait",
                  )}
                >
                  {pending && selected ? (
                    <ButtonSpinner />
                  ) : Icon ? (
                    <Icon className="size-3.5 shrink-0" />
                  ) : null}
                  {opt.label}
                </button>
              );
            })}
          </div>

          {pending ? (
            <p className="text-label-12 text-sio-fg-muted" aria-live="polite">
              Saving…
            </p>
          ) : null}

          {error ? (
            <p className="text-label-12 text-sio-status-danger-fg" role="alert">
              {error}. Try again or refresh the page.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
