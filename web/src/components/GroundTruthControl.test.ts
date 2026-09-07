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
  GroundTruthControl,
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
