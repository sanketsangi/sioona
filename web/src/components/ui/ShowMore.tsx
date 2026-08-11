"use client";

import { CaretDown } from "@phosphor-icons/react/ssr";

type ShowMoreProps = {
  /** Controlled expanded state (geistcn API). */
  expanded?: boolean;
  onClick?: () => void;
  /** Hide the hairline divider behind the trigger. */
  noBorder?: boolean;
  /** Points at the controlled list for `aria-controls`. */
  "aria-controls"?: string;
  className?: string;
  /** Override default “Show More” label. */
  moreLabel?: string;
  /** Override default “Show Less” label. */
  lessLabel?: string;
};

/**
 * Local ShowMore primitive matching `@vercel/geistcn` ShowMore API.
 * geistcn is not on public npm — keep API-aligned for drop-in later.
 *
 * Usage: `<ShowMore expanded={expanded} onClick={() => setExpanded(!expanded)} />`
 */
export function ShowMore({
  expanded = false,
  onClick,
  noBorder = false,
  "aria-controls": ariaControls,
  className = "",
  moreLabel = "Show More",
  lessLabel = "Show Less",
}: ShowMoreProps) {
  return (
    <div
      className={`relative flex w-full items-center justify-center py-1 ${className}`}
    >
      {!noBorder ? (
        <div
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-sio-border-base"
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        aria-controls={ariaControls}
        className="relative z-[1] inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-full border border-sio-border-base bg-sio-bg-base px-3 text-label-13 font-medium text-sio-fg-subtle outline-none transition-[border-color,color,background-color] duration-150 hover:border-sio-border-strong hover:bg-sio-bg-interactive-hover hover:text-sio-fg-base focus-visible:shadow-[0_0_0_2px_var(--sio-bg-base),0_0_0_4px_var(--sio-focus-accent)] md:min-h-9"
      >
        {expanded ? lessLabel : moreLabel}
        <CaretDown
          className={`size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
          weight="bold"
          aria-hidden
        />
      </button>
    </div>
  );
}
