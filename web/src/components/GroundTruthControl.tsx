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
 * Open-menu row chrome matching Add Filter rows: label-14, base foreground,
 * 44px / 32px hit area, and an inset interactive wash on highlight.
 * Icons carry type. No persistent fill and no signal tint.
 * The radio check is pulled into the row so it does not cover the label.
 */
export function groundTruthOptionRowClass(
  _value: GroundTruthValue,
  _suggested: boolean,
): string {
  return cn(
    "relative flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-none px-3 py-0 text-left text-label-14 text-sio-fg-base outline-none touch-manipulation md:h-8",
    "focus:bg-transparent focus:text-sio-fg-base data-[highlighted]:bg-transparent data-[highlighted]:text-sio-fg-base",
    "focus-visible:shadow-[var(--focus-ring)]",
    "before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-0 before:rounded-lg before:bg-sio-bg-interactive before:opacity-0 before:content-['']",
    "focus:before:opacity-100 data-[highlighted]:before:opacity-100",
    "[&_[data-slot=dropdown-menu-radio-item-indicator]]:relative [&_[data-slot=dropdown-menu-radio-item-indicator]]:right-auto [&_[data-slot=dropdown-menu-radio-item-indicator]]:z-[1] [&_[data-slot=dropdown-menu-radio-item-indicator]]:order-last [&_[data-slot=dropdown-menu-radio-item-indicator]]:flex [&_[data-slot=dropdown-menu-radio-item-indicator]]:size-4 [&_[data-slot=dropdown-menu-radio-item-indicator]]:shrink-0 [&_[data-slot=dropdown-menu-radio-item-indicator]]:items-center [&_[data-slot=dropdown-menu-radio-item-indicator]]:justify-center",
    "[&_[data-slot=dropdown-menu-radio-item-indicator]:empty]:hidden",
  );
}

/** Same listbox metrics as Add Filter’s type list. */
export const GROUND_TRUTH_OPTIONS_LIST_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-y-auto py-1 overscroll-contain [scrollbar-width:thin] md:max-h-80 md:flex-none";

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
 * Same menu shell as Add Filter (`PopoverContent` in AddFilterPopover):
 * panel radius, base fill and border, layered shadow, no default ring.
 * Width matches that menu (`w-screen` below `md`, `md:w-80` at 320px).
 * The options list stays a dropdown — not the filter’s full-viewport sheet.
 */
export const GROUND_TRUTH_MENU_CLASS = cn(
  "material-menu flex h-auto w-screen max-md:w-screen max-md:max-w-none flex-col gap-0 overflow-hidden border border-sio-border-base bg-sio-bg-base p-0 text-sio-fg-base outline-none ring-0 overscroll-contain rounded-[var(--radius-panel)] shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.04),0_12px_24px_-4px_rgba(0,0,0,0.06)]",
  "max-h-[var(--radix-dropdown-menu-content-available-height)] md:w-80",
  "motion-reduce:animate-none",
);

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
            sideOffset={8}
            aria-labelledby={labelId}
            className={GROUND_TRUTH_MENU_CLASS}
          >
            <DropdownMenuLabel className="flex h-12 flex-none items-center px-3 py-0 text-copy-16 font-normal text-sio-fg-muted md:h-10 md:text-label-14">
              Ground Truth
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={toGroundTruthRadioValue(value)}
              onValueChange={(next) => {
                if (!next || pending) return;
                void onSelect(fromGroundTruthRadioValue(next as RadioValue));
              }}
              className={GROUND_TRUTH_OPTIONS_LIST_CLASS}
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
                    <span className="relative z-[1] flex size-4 shrink-0 items-center justify-center">
                      <Icon className="size-4 shrink-0" />
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1 truncate text-label-14 text-sio-fg-base">
                      {opt.label}
                    </span>
                    {suggested ? (
                      <span className="relative z-[1] ml-auto shrink-0 text-label-12 font-normal text-sio-fg-muted">
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
