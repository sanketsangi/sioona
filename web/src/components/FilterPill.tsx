"use client";

import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const PILL_LINE =
  "outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)]";

/** Geist add-pill hairline — not a palette token. */
const PILL_HAIRLINE_SHADOW =
  "shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.06)]";

const PILL_SOLID_BG = cn(
  "bg-sio-bg-base [outline-style:solid] outline-sio-border-base",
  "group-hover:bg-sio-bg-interactive group-hover/trigger:bg-sio-bg-interactive",
  "group-focus-visible/trigger:bg-sio-bg-interactive",
  "group-hover:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)] group-hover/trigger:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)]",
  "group-focus-visible/trigger:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)]",
  "group-data-[state=open]/trigger:bg-sio-bg-muted group-data-[state=open]/trigger:outline-sio-border-strong",
);

export const FILTER_PILL_TRIGGER_CLASS =
  "group/trigger relative max-w-full cursor-pointer rounded-[10ex] touch-manipulation outline-none select-none !ring-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] focus-visible:shadow-[var(--focus-ring)] md:before:hidden";

/** Outer Geist group so unnamed `group-hover:` (labels + add fill) works. */
export function FilterPillFrame({ children }: { children: ReactNode }) {
  return <div className="group relative">{children}</div>;
}

export const FilterPillTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & {
    variant: "add" | "suggestion" | "applied";
    href?: string;
    clearable?: boolean;
    /** Closed Ground Truth chip: full pill, hairline border, quiet hover. */
    shape?: "default" | "full";
  }
>(function FilterPillTrigger(
  {
    variant,
    className,
    children,
    type = "button",
    href,
    clearable = false,
    shape = "default",
    ...props
  },
  ref,
) {
  const solid = variant === "add" || variant === "applied";
  const full = shape === "full";
  const radius = full ? "rounded-full" : "rounded-[10ex]";
  const inner = (
    <>
      <div
        className={cn(
          "absolute inset-0 outline-offset-0 transition-[background-color,border-color,outline-color] duration-150 motion-reduce:transition-none",
          radius,
          full
            ? "bg-transparent group-hover/trigger:bg-sio-bg-interactive group-focus-visible/trigger:bg-sio-bg-interactive"
            : "outline-1",
          !full &&
            (solid
              ? PILL_SOLID_BG
              : cn(
                  "bg-transparent outline-dashed",
                  PILL_LINE,
                  "group-hover:bg-sio-bg-interactive group-hover/trigger:bg-sio-bg-base group-hover/trigger:outline-transparent",
                  "group-focus-visible/trigger:bg-sio-bg-base group-focus-visible/trigger:outline-transparent",
                )),
        )}
        data-pill-background="true"
        aria-hidden
      >
        {full ? null : (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 outline-1 outline-offset-0 [outline-style:solid] outline-transparent transition-colors duration-150 motion-reduce:transition-none",
            radius,
            solid
              ? PILL_HAIRLINE_SHADOW
              : cn(
                  "group-hover/trigger:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)]",
                  "group-focus-visible/trigger:outline-[color-mix(in_oklch,var(--sio-fg-base)_21%,transparent)]",
                ),
          )}
        />
        )}
      </div>
      <div
        className={cn(
          "relative flex h-8 flex-row items-center gap-1.5 px-3 text-label-14",
          radius,
          variant === "add" &&
            "w-[110px] cursor-pointer justify-center leading-none !ring-0",
          variant === "applied" && clearable && "pr-7",
        )}
      >
        {children}
      </div>
    </>
  );
  const triggerClass = cn(
    FILTER_PILL_TRIGGER_CLASS,
    full &&
      "rounded-full border border-sio-border-subtle bg-transparent transition-[background-color,border-color] duration-150 motion-reduce:transition-none hover:border-sio-border-strong hover:bg-sio-bg-interactive",
    href && "inline-flex",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        data-slot="button"
        className={triggerClass}
        aria-current={props["aria-current"]}
        aria-label={props["aria-label"]}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      {...props}
      className={triggerClass}
    >
      {inner}
    </button>
  );
});
FilterPillTrigger.displayName = "FilterPillTrigger";
