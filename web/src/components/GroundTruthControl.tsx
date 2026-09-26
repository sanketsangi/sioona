"use client";

import { CaretDown, CircleDashed } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

export type GroundTruthValue = SignalType | "none" | "";

/** Radio values cannot be empty string — map Unset ↔ unset. */
type RadioValue = "unset" | SignalType | "none";

type GroundTruthIcon = ComponentType<{
  className?: string;
  "data-icon"?: string;
}>;

export const GROUND_TRUTH_OPTIONS: Array<{
  value: GroundTruthValue;
  radioValue: RadioValue;
  label: string;
  hint: string;
  Icon: GroundTruthIcon;
}> = [
  {
    value: "",
    radioValue: "unset",
    label: "Unset",
    hint: "No ground truth label",
    Icon: CircleDashed,
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
 * Open-menu row chrome: quiet neutrals for every option (icons carry type).
 * Focus uses interactive wash — no signal tint fills.
 */
export function groundTruthOptionRowClass(
  _value: GroundTruthValue,
  suggested: boolean,
): string {
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

/**
 * Role of the picker, shown in a popover. Quieter than Correct / Incorrect /
 * Partially correct: helper copy, not a review action.
 */
export const GROUND_TRUTH_ROLE_LABEL =
  "Gold label for the Labeled panel. Does not change this week’s score.";

/**
 * Quiet menu surface (`.material-menu`): panel radius, base fill and border,
 * layered shadow. Helper copy is copy-14. Fade only — no zoom.
 */
export const GROUND_TRUTH_ROLE_POPOVER_CLASS = cn(
  "material-menu w-auto max-w-[16rem] gap-0 rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-3 text-sio-fg-subtle ring-0",
  "shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.04),0_12px_24px_-4px_rgba(0,0,0,0.06)]",
  "data-open:zoom-in-100 data-closed:zoom-out-100",
  "motion-reduce:animate-none motion-reduce:duration-0",
);

export function GroundTruthRoleLabel({ id }: { id: string }) {
  return (
    <p id={id} className="text-pretty text-copy-14 text-sio-fg-subtle">
      {GROUND_TRUTH_ROLE_LABEL}
    </p>
  );
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
  const roleLabelId = useId();
  const [open, setOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const roleShowTimer = useRef<number | null>(null);
  const roleHideTimer = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<GroundTruthValue>(groundTruth ?? "");
  const [prevGroundTruth, setPrevGroundTruth] = useState(groundTruth);
  const [error, setError] = useState<string | null>(null);

  if (groundTruth !== prevGroundTruth) {
    setPrevGroundTruth(groundTruth);
    setValue(groundTruth ?? "");
  }

  useEffect(() => {
    return () => {
      if (roleShowTimer.current != null) window.clearTimeout(roleShowTimer.current);
      if (roleHideTimer.current != null) window.clearTimeout(roleHideTimer.current);
    };
  }, []);

  function clearRoleShowTimer() {
    if (roleShowTimer.current == null) return;
    window.clearTimeout(roleShowTimer.current);
    roleShowTimer.current = null;
  }

  function clearRoleHideTimer() {
    if (roleHideTimer.current == null) return;
    window.clearTimeout(roleHideTimer.current);
    roleHideTimer.current = null;
  }

  function showRolePopover() {
    if (open) return;
    clearRoleHideTimer();
    clearRoleShowTimer();
    roleShowTimer.current = window.setTimeout(() => setRoleOpen(true), 400);
  }

  function hideRolePopover() {
    clearRoleShowTimer();
    clearRoleHideTimer();
    roleHideTimer.current = window.setTimeout(() => setRoleOpen(false), 80);
  }

  const currentLabel = groundTruthStatusLabel(value);
  const currentOption =
    GROUND_TRUTH_OPTIONS.find((o) => o.value === value) ??
    GROUND_TRUTH_OPTIONS[0];
  const CurrentIcon = currentOption.Icon;

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
      <Popover open={roleOpen && !open} onOpenChange={setRoleOpen}>
        <PopoverAnchor asChild>
          <div
            className="flex"
            onPointerEnter={showRolePopover}
            onPointerLeave={hideRolePopover}
            onFocus={showRolePopover}
            onBlur={hideRolePopover}
          >
            <FilterPillFrame>
        <DropdownMenu
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              clearRoleShowTimer();
              clearRoleHideTimer();
              setRoleOpen(false);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <FilterPillTrigger
              id={labelId}
              variant="suggestion"
              disabled={pending}
              aria-busy={pending}
              aria-invalid={error ? true : undefined}
              aria-label={`Ground Truth, ${currentLabel}`}
              aria-describedby={roleOpen ? roleLabelId : undefined}
              title={error ? groundTruthSaveErrorMessage(error) : undefined}
              className={cn(pending && "cursor-wait opacity-80")}
            >
              {pending ? (
                <ButtonSpinner className="size-3.5 shrink-0" />
              ) : (
                <CurrentIcon className="size-3.5 shrink-0 text-sio-fg-subtle" />
              )}
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
                    <Icon className="size-3.5 shrink-0 text-sio-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {suggested ? (
                      <span className="ml-auto text-label-12 font-normal text-sio-fg-muted">
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
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={() => {
            clearRoleHideTimer();
            setRoleOpen(true);
          }}
          onPointerLeave={hideRolePopover}
          className={GROUND_TRUTH_ROLE_POPOVER_CLASS}
        >
          <GroundTruthRoleLabel id={roleLabelId} />
        </PopoverContent>
      </Popover>

      <p className="sr-only" aria-live="polite">
        {pending ? "Saving…" : null}
      </p>
      {error ? <GroundTruthSaveError error={error} /> : null}
    </div>
  );
}
