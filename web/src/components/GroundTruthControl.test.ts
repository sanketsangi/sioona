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

import { GroundTruthControl } from "@/components/GroundTruthControl";

describe("GroundTruthControl", () => {
  it("uses a single Card well with Unset chip and type toggles", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        className: "insights-review-pane insights-review-well overflow-hidden",
      }),
    );

    expect(html).toContain("Ground Truth");
    expect(html).toContain("Unset");
    expect(html).toContain("Lead");
    expect(html).toContain("Retention");
    expect(html).toContain("Upsell");
    expect(html).toContain("None");
    expect(html).toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain("flex min-w-0 flex-wrap items-center justify-between");
    expect(html).toContain(
      "truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base",
    );
    expect(html).not.toContain('data-slot="card-header"');
    expect(html).not.toContain('data-slot="card-title"');
    expect(html).not.toContain('data-slot="card-action"');
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="card-content"');
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
    expect(html).toContain("insights-review-well");
    expect(html.match(/insights-review-well/g)?.length).toBe(1);
    expect(html).not.toContain("Saving…");
    expect(html).not.toContain('role="alert"');
  });

  it("shows the Lead chip when ground truth is set", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        groundTruth: "lead",
      }),
    );

    expect(html).toContain("Lead");
    expect(html).toContain("bg-sio-signal-lead-bg text-sio-signal-lead-fg");
    expect(html).toContain("Labeled as Lead");
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
  });
});
