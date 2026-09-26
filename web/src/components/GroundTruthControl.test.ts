import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import {
  GROUND_TRUTH_MENU_CLASS,
  GROUND_TRUTH_ROLE_LABEL,
  GROUND_TRUTH_ROLE_POPOVER_CLASS,
  GroundTruthControl,
  GroundTruthRoleLabel,
  GroundTruthSaveError,
  groundTruthOptionRowClass,
  groundTruthSaveErrorMessage,
  isGroundTruthSuggestedOption,
} from "@/components/GroundTruthControl";

describe("isGroundTruthSuggestedOption", () => {
  it("highlights only the detected signal type", () => {
    expect(isGroundTruthSuggestedOption("retention", "retention")).toBe(true);
    expect(isGroundTruthSuggestedOption("lead", "retention")).toBe(false);
    expect(isGroundTruthSuggestedOption("", "retention")).toBe(false);
    expect(isGroundTruthSuggestedOption("none", "retention")).toBe(false);
    expect(isGroundTruthSuggestedOption("retention", undefined)).toBe(false);
  });
});

describe("groundTruthOptionRowClass", () => {
  it("matches Add Filter rows without signal colors", () => {
    for (const value of ["", "lead", "retention", "upsell", "none"] as const) {
      const row = groundTruthOptionRowClass(value, false);
      expect(row).toContain("text-sio-fg-base");
      expect(row).toContain("text-label-14");
      expect(row).toContain("h-11");
      expect(row).toContain("md:h-8");
      expect(row).toContain("px-3");
      expect(row).toContain("gap-2");
      expect(row).toContain("touch-manipulation");
      expect(row).toContain("before:bg-sio-bg-interactive");
      expect(row).toContain("before:inset-x-1");
      expect(row).toContain("before:rounded-lg");
      expect(row).toContain("data-[highlighted]:before:opacity-100");
      expect(row).toContain("focus:before:opacity-100");
      expect(row).not.toContain("text-sio-fg-muted");
      expect(row).not.toContain("sio-signal-");
      expect(row).not.toContain("focus:bg-accent");
    }
  });

  it("does not give the suggested option a persistent fill", () => {
    const suggested = groundTruthOptionRowClass("retention", true);
    expect(suggested).toContain("text-sio-fg-base");
    expect(suggested).toContain("text-label-14");
    expect(suggested).toContain("before:bg-sio-bg-interactive");
    expect(suggested).not.toContain("bg-sio-bg-muted");
    expect(suggested).not.toContain("font-medium");
    expect(suggested).not.toContain("sio-signal-");
    expect(suggested).not.toContain("ring-1");
  });
});

describe("GroundTruthControl", () => {
  it("renders a FilterPill trigger with visible Ground Truth label", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        defaultType: "retention",
      }),
    );

    expect(html).toContain('aria-label="Ground Truth, Unset"');
    expect(html).toContain("Ground Truth");
    expect(html).toContain("Unset");
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-[10ex]");
    expect(html).toContain("outline-dashed");
    expect(html).toContain(
      "relative flex h-8 flex-row items-center gap-1.5 rounded-[10ex] px-3 text-label-14",
    );
    expect(html).toContain('data-slot="dropdown-menu-trigger"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain('data-slot="card"');
    expect(html).not.toContain('data-slot="toggle-group"');
    expect(html).toContain('data-slot="popover-anchor"');
    expect(html).not.toContain(GROUND_TRUTH_ROLE_LABEL);
    expect(html).not.toContain("Optional Eval gold label");
    expect(html).not.toContain("Saving…");
    expect(html).not.toContain('role="alert"');
    // Closed trigger stays FilterPill chrome — no signal tint on the pill itself
    expect(html).not.toContain("bg-sio-signal-lead-bg");
    expect(html).not.toContain("bg-sio-signal-retention-bg");
    expect(html).not.toContain("bg-sio-signal-upsell-bg");
  });

  it("keeps unset FilterPill chrome and shows type icon when ground truth is set", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        groundTruth: "lead",
        defaultType: "retention",
      }),
    );

    expect(html).toContain('aria-label="Ground Truth, Lead"');
    expect(html).toContain("Ground Truth");
    expect(html).toContain("Lead");
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("outline-dashed");
    expect(html).toContain("[mask-image:var(--geist-icon)]");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("bg-sio-bg-base [outline-style:solid] outline-sio-border-base");
    expect(html).not.toContain("bg-sio-signal-lead-bg");
  });
});

describe("GROUND_TRUTH_MENU_CLASS", () => {
  it("uses the Add Filter menu shell", () => {
    expect(GROUND_TRUTH_MENU_CLASS).toContain("material-menu");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("rounded-[var(--radius-panel)]");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("bg-sio-bg-base");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("border-sio-border-base");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("p-0");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("ring-0");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("md:w-80");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("w-screen");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("max-md:w-screen");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("max-md:max-w-none");
    expect(GROUND_TRUTH_MENU_CLASS).not.toMatch(/(?:^|\s)w-80(?:\s|$)/);
    expect(GROUND_TRUTH_MENU_CLASS).toContain(
      "shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.04),0_12px_24px_-4px_rgba(0,0,0,0.06)]",
    );
    expect(GROUND_TRUTH_MENU_CLASS).toContain("motion-reduce:animate-none");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("shadow-md");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("bg-popover");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("h-dvh");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:fixed");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:inset-0");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:rounded-none");
  });
});

describe("GroundTruthRoleLabel", () => {
  it("states the gold label for the Labeled panel and that the week score is unchanged", () => {
    expect(GROUND_TRUTH_ROLE_LABEL).toBe(
      "Gold label for the Labeled panel. Does not change this week’s score.",
    );

    const html = renderToStaticMarkup(
      createElement(GroundTruthRoleLabel, { id: "gt-role" }),
    );

    expect(html).toContain(`id="gt-role"`);
    expect(html).toContain(GROUND_TRUTH_ROLE_LABEL);
    expect(html).toContain("text-copy-14");
    expect(html).toContain("text-sio-fg-subtle");
    expect(html).not.toContain("text-label-12");
    expect(html).not.toContain("text-right");
    expect(html).not.toContain("border");
    expect(html).not.toContain("bg-sio-");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("material-menu");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("rounded-[var(--radius-panel)]");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("bg-sio-bg-base");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("border-sio-border-base");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("ring-0");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("motion-reduce:animate-none");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).not.toContain("bg-popover");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).not.toContain("shadow-md");
    expect(html).not.toContain("sr-only");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("bg-sio-bg-inverse");
    expect(html).not.toContain("text-sio-fg-on-color");
  });
});

describe("GroundTruthSaveError", () => {
  it("shows a visible danger alert for sighted and touch users", () => {
    const message = groundTruthSaveErrorMessage("Failed to save ground truth");
    expect(message).toBe(
      "Failed to save ground truth. Try again or refresh the page.",
    );

    const html = renderToStaticMarkup(
      createElement(GroundTruthSaveError, {
        error: "Failed to save ground truth",
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html).toContain("text-sio-status-danger-fg");
    expect(html).not.toContain("sr-only");
  });
});
