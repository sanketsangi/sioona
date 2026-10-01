"use client";

/**
 * Skiper UI skiper45 — Family Receive treatment.
 * Registry demo (`@skiper-ui/skiper45`) is a morphing confirmation: button expands
 * into a confirmation surface. We expose:
 * - `Skiper45` — full-bleed backdrop for DialogOverlay (modal dialogs only)
 * - `Skiper45MorphConfirmation` — Run Actions gate as **Popover** (no overlay)
 * - `skiper45DialogContentClassName` — panel surface for DialogContent variant
 * - `skiper45PopoverContentClassName` — quiet Sioona panel for gate Popover
 *
 * Registry install: set SKIPER_LICENSE_KEY in `.env.local`, then
 * `npx shadcn add @skiper-ui/skiper45` (re-apply sio tokens after overwrite).
 *
 * Honors prefers-reduced-motion on Dialog overlay blur / panel animations.
 */

import {
  useId,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Skiper45Props = {
  className?: string;
};

/**
 * Absolute full-bleed Family Receive–style scrim.
 * Parent must be positioned (`fixed`/`absolute` + `inset-0`) — e.g. DialogOverlay.
 * Decorative only: `aria-hidden`, `pointer-events-none` (clicks hit the parent overlay).
 */
export function Skiper45({ className }: Skiper45Props) {
  return (
    <div
      aria-hidden
      data-skiper="45"
      className={cn(
        "pointer-events-none absolute inset-0",
        "bg-sio-bg-overlay",
        // Soft center vignette — quieter than a hard fill; matches Family Receive depth.
        "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
        "before:bg-[radial-gradient(ellipse_at_center,transparent_35%,color-mix(in_oklch,var(--foreground)_18%,transparent)_100%)]",
        "motion-safe:supports-[backdrop-filter]:backdrop-blur-[6px] motion-safe:supports-[backdrop-filter]:before:opacity-90",
        className,
      )}
    />
  );
}

/** Shared Family Receive panel surface + morph (dialog variant only). */
const skiper45PanelSurfaceClassName = cn(
  // Surface: quieter border, larger soft radius, Family-style elevation.
  "gap-5 rounded-[1.75rem] border border-sio-border-subtle bg-sio-bg-base p-7",
  "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-4px_rgba(0,0,0,0.1),0_24px_48px_-12px_rgba(0,0,0,0.08)]",
  // Morph open/close — longer spring-like ease; reduce zoom when motion is reduced.
  "duration-300 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-90 data-open:slide-in-from-bottom-2",
  "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-150",
  "ease-[cubic-bezier(0.32,0.72,0,1)]",
  "motion-reduce:animate-none motion-reduce:duration-0 motion-reduce:data-open:zoom-in-100 motion-reduce:data-open:slide-in-from-bottom-0 motion-reduce:data-closed:zoom-out-100",
);

/**
 * Family Receive confirmation panel — soft radius, layered shadow, spring-like
 * open morph, pill footer actions. Opt in via DialogContent `variant="skiper45"`.
 * Adapted to sio tokens (no purple / neon).
 */
export const skiper45DialogContentClassName = cn(
  skiper45PanelSurfaceClassName,
  "sm:max-w-[26rem]",
  // Title / description / actions — Family Receive confirmation rhythm.
  "[&_[data-slot=dialog-header]]:gap-3",
  "[&_[data-slot=dialog-title]]:text-lg [&_[data-slot=dialog-title]]:font-semibold [&_[data-slot=dialog-title]]:tracking-tight",
  "[&_[data-slot=dialog-description]]:text-[15px] [&_[data-slot=dialog-description]]:leading-relaxed",
  "[&_[data-slot=dialog-footer]]:mt-1 [&_[data-slot=dialog-footer]]:gap-3 [&_[data-slot=dialog-footer]]:sm:justify-stretch",
  "[&_[data-slot=dialog-footer]_button]:min-h-9 [&_[data-slot=dialog-footer]_button]:rounded-full sm:[&_[data-slot=dialog-footer]_button]:flex-1",
);

/**
 * Quiet Sioona panel for the Give Feedback gate Popover (anchored — no overlay).
 * Matches default DialogContent chrome — not Family Receive (skiper45 dialog).
 */
export const skiper45PopoverContentClassName = cn(
  // Surface: panel ladder — border + fill, near-zero elevation (Geist quiet panel).
  "w-[min(calc(100vw-2rem),24rem)] gap-4 rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-4 text-sio-fg-base shadow-none ring-0",
  // Fade only — kill default PopoverContent zoom; honor reduced motion.
  "duration-100 ease-[cubic-bezier(0.2,0,0,1)]",
  "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-100",
  "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-100",
  "motion-reduce:animate-none motion-reduce:duration-0",
  "[&_[data-slot=popover-header]]:gap-2",
  "[&_[data-slot=popover-title]]:text-base [&_[data-slot=popover-title]]:font-semibold [&_[data-slot=popover-title]]:tracking-tight",
  "[&_[data-slot=popover-description]]:text-sm [&_[data-slot=popover-description]]:leading-relaxed",
  "[&_[data-slot=popover-footer]]:mt-1 [&_[data-slot=popover-footer]]:flex [&_[data-slot=popover-footer]]:flex-col-reverse [&_[data-slot=popover-footer]]:gap-2 sm:[&_[data-slot=popover-footer]]:flex-row sm:[&_[data-slot=popover-footer]]:justify-end",
);

export type Skiper45MorphConfirmationProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Closed-state control (e.g. Run Actions button + tooltip). */
  trigger: ReactNode;
  title: string;
  description: string;
  titleId?: string;
  descriptionId?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Focus target after open (defaults to confirm). */
  confirmRef?: RefObject<HTMLButtonElement | null>;
  /** @deprecated Unused — kept for call-site compatibility. */
  layoutId?: string;
  className?: string;
};

/**
 * Gate confirmation as an anchored Popover (no dialog overlay / scrim).
 * Escape / outside click / Cancel close; confirm runs `onConfirm`.
 */
export function Skiper45MorphConfirmation({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  titleId: titleIdProp,
  descriptionId: descriptionIdProp,
  cancelLabel = "Cancel",
  confirmLabel = "Give Feedback",
  onConfirm,
  confirmRef,
  className,
}: Skiper45MorphConfirmationProps) {
  const autoTitleId = useId();
  const autoDescId = useId();
  const titleId = titleIdProp ?? autoTitleId;
  const descriptionId = descriptionIdProp ?? autoDescId;

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      {/*
        Anchor only — the Run Actions button already opens via controlled
        `open` (click / A / Enter). Avoid PopoverTrigger nesting under Tooltip.
      */}
      <PopoverAnchor asChild>
        <span
          className={cn("inline-flex shrink-0", className)}
          data-skiper45-morph=""
          data-skiper45-morph-state={open ? "open" : "closed"}
          data-review-feedback-gate="popover"
        >
          {trigger}
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        collisionPadding={16}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-skiper45=""
        data-review-feedback-gate-panel="true"
        className={cn(
          skiper45PopoverContentClassName,
          "z-50 overscroll-contain outline-none",
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          confirmRef?.current?.focus();
        }}
        onPointerDownOutside={(event) => {
          // Anchor is not PopoverTrigger — ignore dismiss from the Run Actions control.
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[data-review-feedback-gate="popover"]')
          ) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[data-review-feedback-gate="popover"]')
          ) {
            event.preventDefault();
          }
        }}
      >
        <PopoverHeader className="gap-2">
          <PopoverTitle
            id={titleId}
            className="text-balance text-base font-semibold tracking-tight text-sio-fg-base"
          >
            {title}
          </PopoverTitle>
          <PopoverDescription
            id={descriptionId}
            className="text-sm leading-relaxed text-sio-fg-subtle"
          >
            {description}
          </PopoverDescription>
        </PopoverHeader>
        <div
          data-slot="popover-footer"
          className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
        >
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-9 touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="default"
            size="lg"
            className="min-h-9 touch-manipulation bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { Skiper45 as Skiper45Backdrop };
