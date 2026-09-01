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
    expect(html).toContain('data-slot="toggle-group"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(
      "grid w-full min-w-0 grid-cols-5 gap-2 max-[420px]:grid-cols-3",
    );
    expect(html).not.toContain("flex w-full flex-wrap justify-start");
    expect(html).not.toContain("gap-[calc(var(--gap)*0.25rem)]");
    expect(html).toContain(
      "inline-flex h-9 min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium touch-manipulation md:min-h-9",
    );
    expect(html).not.toContain("w-full min-w-0 flex-1");
    expect(html).toContain(
      "border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive",
    );
    expect(html).toContain(
      "data-[state=on]:border-transparent data-[state=on]:bg-sio-bg-inverse data-[state=on]:text-sio-fg-on-color data-[state=on]:hover:border-transparent data-[state=on]:hover:bg-sio-bg-inverse/90",
    );
    expect(html).toContain("whitespace-nowrap leading-none");
    expect(html).not.toContain("min-w-0 truncate leading-none");
    expect(html).not.toContain("truncate leading-none");
    expect(html).toContain("/icons/lead.svg");
    expect(html).toContain("/icons/retention.svg");
    expect(html).toContain("/icons/upsell.svg");
    expect(html).toContain("/icons/stop.svg");
    expect(html).not.toContain("/icons/good.svg");
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
    expect(html).toContain("data-[state=on]:bg-sio-bg-inverse");
    expect(html).toContain("data-[state=on]:text-sio-fg-on-color");
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
  });
});
