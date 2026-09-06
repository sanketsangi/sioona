"use client";

import { CaretDown } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import {
  useId,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import {
  FilterPillFrame,
  FilterPillTrigger,
} from "@/components/FilterPill";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { StopIcon } from "@/components/icons/StopIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signalTypeMarkClass } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

export type GroundTruthValue = SignalType | "none" | "";

/** Radio values cannot be empty string — map Unset ↔ unset. */
type RadioValue = "unset" | SignalType | "none";

function isGroundTruthSignalType(
  value: GroundTruthValue,
): value is SignalType {
  return value === "lead" || value === "retention" || value === "upsell";
}

export const GROUND_TRUTH_OPTIONS: Array<{
  value: GroundTruthValue;
  radioValue: RadioValue;
  label: string;
  hint: string;
  Icon?: ComponentType<{ className?: string; "data-icon"?: string }>;
}> = [
  {
    value: "",
    radioValue: "unset",
    label: "Unset",
    hint: "No ground truth label",
  },
  {
    value: "lead",
    radioValue: "lead",
    label: "Lead",
    hint: "Labeled as Lead",
    Icon: LeadIcon,
  },
  {
    value: "retention",
    radioValue: "retention",
    label: "Retention",
    hint: "Labeled as Retention",
    Icon: RetentionIcon,
  },
  {
    value: "upsell",
    radioValue: "upsell",
    label: "Upsell",
    hint: "Labeled as Upsell",
    Icon: UpsellIcon,
  },
  {
    value: "none",
    radioValue: "none",
    label: "None",
    hint: "Explicitly no signal",
    Icon: StopIcon,
  },
];

export function groundTruthStatusLabel(value: GroundTruthValue): string {
  return GROUND_TRUTH_OPTIONS.find((o) => o.value === value)?.label ?? "Unset";
}

export function toGroundTruthRadioValue(value: GroundTruthValue): RadioValue {
  return value === "" ? "unset" : value;
}

export function fromGroundTruthRadioValue(value: RadioValue): GroundTruthValue {
  return value === "unset" ? "" : value;
}

/** Detected signal type is the suggested default in the picker (not Unset / None). */
export function isGroundTruthSuggestedOption(
  optionValue: GroundTruthValue,
  defaultType?: SignalType,
): boolean {
  return Boolean(defaultType && optionValue === defaultType);
}

/**
 * Open-menu row chrome: Lead / Retention / Upsell use signal type mark tokens;
 * Unset / None stay quiet. Focus keeps the same tint (no menu accent wash).
 */
export function groundTruthOptionRowClass(
  value: GroundTruthValue,
  suggested: boolean,
): string {
  if (isGroundTruthSignalType(value)) {
    return cn(
      "gap-2 rounded-md py-1.5 pr-8 pl-2 text-label-14",
      signalTypeMarkClass(value),
      value === "lead" &&
        "focus:bg-sio-signal-lead-bg focus:text-sio-signal-lead-fg",
      value === "retention" &&
        "focus:bg-sio-signal-retention-bg focus:text-sio-signal-retention-fg",
      value === "upsell" &&
        "focus:bg-sio-signal-upsell-bg focus:text-sio-signal-upsell-fg",
      suggested && "font-medium ring-1 ring-inset ring-sio-border-base/50",
    );
  }

  return cn(
    "gap-2 rounded-md py-1.5 pr-8 pl-2 text-label-14 text-sio-fg-muted",
    "focus:bg-sio-bg-interactive focus:text-sio-fg-base",
    suggested && "bg-sio-bg-muted font-medium text-sio-fg-base",
  );
}

/**
 * Compact Ground Truth picker for the Feedback pane header.
 * Saves via the same `/api/conversations/:id/ground-truth` path as before.
 */
export function groundTruthSaveErrorMessage(error: string): string {
  return `${error}. Try again or refresh the page.`;
}

/** Visible save failure under the FilterPill (not sr-only — touch has no title). */
export function GroundTruthSaveError({ error }: { error: string }) {
  return (
    <p
      className="max-w-[16rem] text-pretty text-right text-label-12 leading-5 text-sio-status-danger-fg"
      role="alert"
    >
      {groundTruthSaveErrorMessage(error)}
    </p>
  );
}

export function GroundTruthControl({
  conversationId,
  groundTruth,
  defaultType,
  className,
}: {
  conversationId: string;
  groundTruth?: SignalType | "none";
  /** Signal’s detected type — highlighted as the suggested default in the menu. */
  defaultType?: SignalType;
  className?: string;
}) {
  const router = useRouter();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<GroundTruthValue>(groundTruth ?? "");
  const [prevGroundTruth, setPrevGroundTruth] = useState(groundTruth);
  const [error, setError] = useState<string | null>(null);

  if (groundTruth !== prevGroundTruth) {
    setPrevGroundTruth(groundTruth);
    setValue(groundTruth ?? "");
  }

  const currentLabel = groundTruthStatusLabel(value);

  async function onSelect(next: GroundTruthValue) {
    if (next === value || pending) return;
    const previous = value;
    setValue(next);
    setError(null);
    setOpen(false);
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

  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col items-end gap-1",
        className,
      )}
    >
      <FilterPillFrame>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <FilterPillTrigger
              id={labelId}
              variant={value ? "applied" : "suggestion"}
              disabled={pending}
              aria-busy={pending}
              aria-invalid={error ? true : undefined}
              aria-label={`Ground Truth, ${currentLabel}`}
              title={
                error
                  ? groundTruthSaveErrorMessage(error)
                  : "Ground Truth — optional Eval gold label"
              }
              className={cn(pending && "cursor-wait opacity-80")}
            >
              {pending ? (
                <ButtonSpinner className="size-3.5 shrink-0" />
              ) : null}
              <span className="flex min-w-0 max-w-[12rem] flex-row items-center gap-1 font-medium whitespace-nowrap">
                <span className="shrink-0 font-normal text-sio-fg-subtle opacity-80 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100">
                  Ground Truth
                </span>
                <span
                  className="min-w-0 truncate text-sio-fg-subtle transition-colors duration-150 motion-reduce:transition-none group-hover:text-sio-fg-base"
                  translate="no"
                >
                  {currentLabel}
                </span>
                <CaretDown
                  weight="bold"
                  className="size-3.5 shrink-0 text-sio-fg-subtle opacity-70"
                  aria-hidden
                />
              </span>
            </FilterPillTrigger>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            aria-labelledby={labelId}
            className="min-w-44 border border-sio-border-base bg-sio-bg-base p-1 text-sio-fg-base shadow-md ring-0"
          >
            <DropdownMenuLabel className="px-2 py-1.5 text-label-12 font-medium text-sio-fg-muted">
              Ground Truth
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sio-border-subtle" />
            <DropdownMenuRadioGroup
              value={toGroundTruthRadioValue(value)}
              onValueChange={(next) => {
                if (!next || pending) return;
                void onSelect(fromGroundTruthRadioValue(next as RadioValue));
              }}
            >
              {GROUND_TRUTH_OPTIONS.map((opt) => {
                const suggested = isGroundTruthSuggestedOption(
                  opt.value,
                  defaultType,
                );
                const { Icon } = opt;
                const signalTinted = isGroundTruthSignalType(opt.value);
                return (
                  <DropdownMenuRadioItem
                    key={opt.label}
                    value={opt.radioValue}
                    disabled={pending}
                    title={
                      suggested
                        ? `${opt.hint} (detected type)`
                        : opt.hint
                    }
                    aria-label={
                      suggested
                        ? `${opt.hint} (detected type)`
                        : opt.hint
                    }
                    className={groundTruthOptionRowClass(
                      opt.value,
                      suggested,
                    )}
                  >
                    {Icon ? (
                      <Icon
                        className={cn(
                          "size-3.5 shrink-0",
                          !signalTinted && "text-sio-fg-subtle",
                        )}
                      />
                    ) : (
                      <span className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {suggested ? (
                      <span
                        className={cn(
                          "ml-auto text-label-12 font-normal",
                          signalTinted
                            ? "opacity-80"
                            : "text-sio-fg-muted",
                        )}
                      >
                        Detected
                      </span>
                    ) : null}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterPillFrame>

      <p className="sr-only" aria-live="polite">
        {pending ? "Saving…" : null}
      </p>
      {error ? <GroundTruthSaveError error={error} /> : null}
    </div>
  );
}
