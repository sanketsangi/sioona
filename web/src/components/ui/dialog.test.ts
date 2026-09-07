import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Portals are empty under renderToStaticMarkup — render children inline.
vi.mock("radix-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("radix-ui")>();
  const Dialog = {
    ...actual.Dialog,
    Portal: ({ children }: { children?: ReactNode }) =>
      createElement("div", { "data-test-portal": "dialog" }, children),
  };
  const Popover = {
    ...actual.Popover,
    Portal: ({ children }: { children?: ReactNode }) =>
      createElement("div", { "data-test-portal": "popover" }, children),
  };
  return { ...actual, Dialog, Popover };
});

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Skiper45,
  Skiper45MorphConfirmation,
  skiper45DialogContentClassName,
  skiper45PopoverContentClassName,
} from "@/components/v1/skiper45";

describe("Skiper45", () => {
  it("renders Family Receive scrim as decorative overlay fill", () => {
    const html = renderToStaticMarkup(createElement(Skiper45));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-skiper="45"');
    expect(html).toContain("bg-sio-bg-overlay");
    expect(html).toContain("backdrop-blur-[6px]");
    expect(html).toContain("pointer-events-none");
  });

  it("exports Family Receive panel class names for DialogContent", () => {
    expect(skiper45DialogContentClassName).toContain("rounded-[1.75rem]");
    expect(skiper45DialogContentClassName).toContain("zoom-in-90");
    expect(skiper45DialogContentClassName).toContain("motion-reduce:animate-none");
    expect(skiper45DialogContentClassName).toContain("rounded-full");
  });

  it("exports quiet Sioona panel class names for gate PopoverContent (no overlay)", () => {
    expect(skiper45PopoverContentClassName).toContain(
      "rounded-[var(--radius-panel)]",
    );
    expect(skiper45PopoverContentClassName).toContain("border-sio-border-base");
    expect(skiper45PopoverContentClassName).toContain("shadow-none");
    expect(skiper45PopoverContentClassName).toContain("data-open:fade-in-0");
    expect(skiper45PopoverContentClassName).toContain(
      "motion-reduce:animate-none",
    );
    expect(skiper45PopoverContentClassName).toContain(
      "rounded-[var(--radius-control)]",
    );
    expect(skiper45PopoverContentClassName).not.toContain("rounded-[1.75rem]");
    expect(skiper45PopoverContentClassName).not.toContain("zoom-in-90");
    expect(skiper45PopoverContentClassName).not.toContain("rounded-full");
    expect(skiper45PopoverContentClassName).toContain("popover-footer");
    expect(skiper45PopoverContentClassName).not.toContain("dialog-overlay");
  });

  it("renders gate as Popover anchor without dialog overlay", () => {
    const closed = renderToStaticMarkup(
      createElement(Skiper45MorphConfirmation, {
        open: false,
        onOpenChange: () => undefined,
        title: "Give Feedback First",
        description: "Choose Correct, Incorrect, or Partially Correct.",
        onConfirm: () => undefined,
        trigger: createElement("button", { type: "button" }, "Run Actions"),
      }),
    );
    expect(closed).toContain('data-review-feedback-gate="popover"');
    expect(closed).toContain('data-skiper45-morph-state="closed"');
    expect(closed).toContain("Run Actions");
    expect(closed).not.toContain('data-slot="dialog-overlay"');
    expect(closed).not.toContain("data-skiper45-morph-backdrop");

    const open = renderToStaticMarkup(
      createElement(Skiper45MorphConfirmation, {
        open: true,
        onOpenChange: () => undefined,
        title: "Give Feedback First",
        description: "Choose Correct, Incorrect, or Partially Correct.",
        onConfirm: () => undefined,
        trigger: createElement("button", { type: "button" }, "Run Actions"),
      }),
    );
    expect(open).toContain('data-test-portal="popover"');
    expect(open).toContain('data-slot="popover-content"');
    expect(open).toContain("data-review-feedback-gate-panel");
    expect(open).toContain("Give Feedback First");
    expect(open).toContain("Give Feedback");
    expect(open).not.toContain('data-slot="dialog-overlay"');
    expect(open).not.toContain('data-slot="dialog-content"');
  });
});

describe("Dialog overlay", () => {
  it("composes Skiper45 inside DialogOverlay when open", () => {
    const html = renderToStaticMarkup(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          { showCloseButton: false },
          createElement(DialogTitle, null, "Edit Draft"),
          createElement("p", null, "Subject and body."),
        ),
      ),
    );

    expect(html).toContain('data-slot="dialog-overlay"');
    expect(html).toContain('data-skiper="45"');
    expect(html).toContain("Edit Draft");
    expect(html).toContain("data-open:animate-in");
    expect(html).not.toMatch(
      /data-slot="dialog-overlay"[^>]*bg-sio-bg-overlay/,
    );
  });
});

describe("DialogContent skiper45 variant", () => {
  it("applies Family Receive panel chrome only when variant is skiper45", () => {
    const defaultHtml = renderToStaticMarkup(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          { showCloseButton: false },
          createElement(DialogTitle, null, "Edit Draft"),
        ),
      ),
    );

    expect(defaultHtml).toContain('data-variant="default"');
    expect(defaultHtml).not.toContain("data-skiper45");
    expect(defaultHtml).toContain("rounded-[var(--radius-panel)]");
    expect(defaultHtml).toContain("shadow-none");
    expect(defaultHtml).not.toContain("rounded-[1.75rem]");

    const skiperHtml = renderToStaticMarkup(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          { variant: "skiper45", showCloseButton: false },
          createElement(
            DialogHeader,
            null,
            createElement(DialogTitle, null, "Give Feedback First"),
            createElement(
              DialogDescription,
              null,
              "Choose Correct, Incorrect, or Partially Correct in Feedback first.",
            ),
          ),
          createElement(DialogFooter, null, "Cancel", "Give Feedback"),
        ),
      ),
    );

    expect(skiperHtml).toContain('data-variant="skiper45"');
    expect(skiperHtml).toContain("data-skiper45");
    expect(skiperHtml).toContain("Give Feedback First");
    expect(skiperHtml).toContain("rounded-[1.75rem]");
    expect(skiperHtml).toContain("zoom-in-90");
    expect(skiperHtml).toContain("motion-reduce:animate-none");
    expect(skiperHtml).toContain("rounded-full");
    expect(skiperHtml).not.toContain("shadow-none");
  });
});
