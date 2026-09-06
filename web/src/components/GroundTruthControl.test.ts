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
  groundTruthOptionRowClass,
  groundTruthTriggerClass,
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
  it("applies signal type mark tokens for Lead, Retention, and Upsell", () => {
    expect(groundTruthOptionRowClass("lead", false)).toContain(
      "bg-sio-signal-lead-bg text-sio-signal-lead-fg",
    );
    expect(groundTruthOptionRowClass("retention", false)).toContain(
      "bg-sio-signal-retention-bg text-sio-signal-retention-fg",
    );
    expect(groundTruthOptionRowClass("upsell", false)).toContain(
      "bg-sio-signal-upsell-bg text-sio-signal-upsell-fg",
    );
  });

  it("keeps Unset and None quiet without signal colors", () => {
    const unset = groundTruthOptionRowClass("", false);
    const none = groundTruthOptionRowClass("none", false);
    expect(unset).toContain("text-sio-fg-muted");
    expect(none).toContain("text-sio-fg-muted");
    expect(unset).not.toContain("sio-signal-");
    expect(none).not.toContain("sio-signal-");
  });

  it("marks the suggested detected type without dropping signal tint", () => {
    const suggested = groundTruthOptionRowClass("retention", true);
    expect(suggested).toContain("bg-sio-signal-retention-bg");
    expect(suggested).toContain("font-medium");
    expect(suggested).toContain("ring-1");
  });
});

describe("groundTruthTriggerClass", () => {
  it("uses Feedback header chip density — not FilterPill chrome", () => {
    const unset = groundTruthTriggerClass("");
    expect(unset).toContain("h-8");
    expect(unset).toContain("rounded-sm");
    expect(unset).toContain("border-sio-border-subtle");
    expect(unset).toContain("text-label-12");
    expect(unset).not.toContain("rounded-[10ex]");
    expect(unset).not.toContain("outline-dashed");
  });

  it("tints the closed trigger when a signal type is set", () => {
    expect(groundTruthTriggerClass("lead")).toContain("bg-sio-signal-lead-bg");
    expect(groundTruthTriggerClass("retention")).toContain(
      "bg-sio-signal-retention-bg",
    );
    expect(groundTruthTriggerClass("upsell")).toContain(
      "bg-sio-signal-upsell-bg",
    );
  });
});

describe("GroundTruthControl", () => {
    it("renders a Ground Truth outline trigger with visible label", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        defaultType: "retention",
      }),
    );

    expect(html).toContain('aria-label="Ground Truth, Unset"');
    expect(html).toContain("Ground Truth");
    expect(html).toContain("Unset");
    expect(html).toContain("rounded-sm");
    expect(html).toContain("border-sio-border-subtle");
    expect(html).toContain("text-label-12");
    expect(html).toContain('data-slot="dropdown-menu-trigger"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain('data-pill-background="true"');
    expect(html).not.toContain("rounded-[10ex]");
    expect(html).not.toContain("outline-dashed");
    expect(html).not.toContain('data-slot="card"');
    expect(html).not.toContain('data-slot="toggle-group"');
    expect(html).not.toContain("Optional Eval gold label");
    expect(html).not.toContain("Saving…");
    expect(html).not.toContain('role="alert"');
    // Unset stays quiet — no signal tint on the closed trigger
    expect(html).not.toContain("bg-sio-signal-lead-bg");
    expect(html).not.toContain("bg-sio-signal-retention-bg");
    expect(html).not.toContain("bg-sio-signal-upsell-bg");
  });

  it("tints the closed trigger when ground truth is set", () => {
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
    expect(html).toContain("bg-sio-signal-lead-bg");
    expect(html).toContain("rounded-sm");
    expect(html).not.toContain("rounded-[10ex]");
    expect(html).not.toContain('data-pill-background="true"');
  });
});
