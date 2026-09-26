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
  it("keeps every option quiet without signal colors", () => {
    for (const value of ["", "lead", "retention", "upsell", "none"] as const) {
      const row = groundTruthOptionRowClass(value, false);
      expect(row).toContain("text-sio-fg-muted");
      expect(row).not.toContain("sio-signal-");
    }
  });

  it("marks the suggested detected type with quiet emphasis", () => {
    const suggested = groundTruthOptionRowClass("retention", true);
    expect(suggested).toContain("bg-sio-bg-muted");
    expect(suggested).toContain("font-medium");
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
