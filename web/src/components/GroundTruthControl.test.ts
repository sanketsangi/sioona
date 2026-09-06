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

  it("uses applied FilterPill chrome when ground truth is set", () => {
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
    expect(html).toContain("bg-sio-bg-base [outline-style:solid] outline-sio-border-base");
    expect(html).not.toContain("outline-dashed");
  });
});
