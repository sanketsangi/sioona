import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

function BubbleGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-group"
      className={cn("chat-bubble-group", className)}
      {...props}
    />
  );
}

/**
 * June 2026 shadcn Bubble — adapted so fills/radius live in `.chat-bubble*`
 * (`globals.css` on `sio-*`). Product lock: customer = muted, agent = default.
 */
const bubbleVariants = cva(
  "group/bubble relative flex w-fit max-w-full min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[align=end]:self-end data-[variant=ghost]:max-w-full",
  {
    variants: {
      variant: {
        default: "",
        secondary: "",
        muted: "",
        tinted: "",
        outline: "",
        ghost:
          "border-none *:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0 *:data-[slot=bubble-content]:border-transparent",
        destructive:
          "*:data-[slot=bubble-content]:bg-destructive/10 *:data-[slot=bubble-content]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function bubbleContentVariantClass(
  variant: VariantProps<typeof bubbleVariants>["variant"],
): string {
  switch (variant) {
    case "muted":
      return "chat-bubble--muted";
    case "ghost":
      return "";
    case "destructive":
      return "";
    case "secondary":
    case "tinted":
    case "outline":
    case "default":
    default:
      return "chat-bubble--default";
  }
}

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    align?: "start" | "end";
  }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  );
}

function BubbleContent({
  asChild = false,
  className,
  variant,
  ...props
}: ComponentProps<"div"> & {
  asChild?: boolean;
  /**
   * Prefer passing the same variant as the parent `Bubble` so `.chat-bubble--*`
   * classes land on the content node (tests + evidence highlight compose here).
   * Parent `data-variant` also drives fills via `globals.css` when omitted.
   */
  variant?: VariantProps<typeof bubbleVariants>["variant"];
}) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="bubble-content"
      data-variant={variant}
      className={cn(
        "chat-bubble w-fit max-w-full min-w-0 overflow-hidden break-words text-pretty group-data-[align=end]/bubble:self-end [button]:text-left [button,a]:outline-none [button,a]:transition-[color,background-color,border-color] [button,a]:focus-visible:shadow-[var(--focus-ring)]",
        variant ? bubbleContentVariantClass(variant) : null,
        className,
      )}
      {...props}
    />
  );
}

const bubbleReactionsVariants = cva(
  "absolute z-10 flex w-fit shrink-0 items-center justify-center gap-1 rounded-full bg-sio-bg-muted px-1.5 py-0.5 text-sm ring-2 ring-sio-bg-base has-[button]:p-0",
  {
    variants: {
      side: {
        top: "top-0 -translate-y-3/4",
        bottom: "bottom-0 translate-y-3/4",
      },
      align: {
        start: "left-3",
        end: "right-3",
      },
    },
    defaultVariants: {
      side: "bottom",
      align: "end",
    },
  },
);

function BubbleReactions({
  side = "bottom",
  align = "end",
  className,
  ...props
}: ComponentProps<"div"> & {
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  return (
    <div
      data-slot="bubble-reactions"
      data-align={align}
      data-side={side}
      className={cn(bubbleReactionsVariants({ side, align }), className)}
      {...props}
    />
  );
}

export { BubbleGroup, Bubble, BubbleContent, BubbleReactions };
