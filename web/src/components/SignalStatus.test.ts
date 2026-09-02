import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalStatus, SignalStatusChip } from "@/components/SignalStatus";
import type { Signal } from "@/lib/types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "Pause SIP",
    suggestedAction: "Follow up",
    evidence: ["quote"],
    status: "new",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SignalStatusChip", () => {
  it("copies Type-chip shell with label, count, and no icons", () => {
    const html = renderToStaticMarkup(
      createElement(SignalStatusChip, {
        state: "QUEUED",
        label: "Pending",
        count: 12,
      }),
    );

    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-sio-status-pending-bg");
    expect(html).toContain("Pending");
    expect(html).toContain("tabular");
    expect(html).toContain(">12<");
    expect(html).not.toContain("status-dot");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("aria-hidden");
  });

  it("tints All / Correct / Done without icons", () => {
    const all = renderToStaticMarkup(
      createElement(SignalStatusChip, {
        state: "ALL",
        label: "All",
        count: 25,
      }),
    );
    const correct = renderToStaticMarkup(
      createElement(SignalStatusChip, {
        state: "READY",
        label: "Correct",
        count: 4,
      }),
    );
    const done = renderToStaticMarkup(
      createElement(SignalStatusChip, {
        state: "CANCELED",
        label: "Done",
        count: 2,
      }),
    );

    expect(all).toContain("All");
    expect(all).toContain("bg-sio-bg-muted");
    expect(correct).toContain("bg-sio-status-success-bg");
    expect(done).toContain("bg-sio-bg-muted");
    expect(all).not.toContain("<svg");
    expect(correct).not.toContain("<svg");
    expect(done).not.toContain("<svg");
  });
});

describe("SignalStatus", () => {
  it("renders queue Pending as StatusDot with a colored indicator", () => {
    const html = renderToStaticMarkup(
      createElement(SignalStatus, { signal: signal() }),
    );

    expect(html).toContain("Pending");
    expect(html).toContain("status-dot");
    expect(html).toContain("status-dot-queued");
    expect(html).toContain("status-dot-indicator");
    expect(html).not.toContain("bg-sio-status-pending-bg");
  });

  it("keeps review-well chip variant as the Badge shell", () => {
    const html = renderToStaticMarkup(
      createElement(SignalStatus, {
        signal: signal(),
        variant: "chip",
      }),
    );

    expect(html).toContain("Pending");
    expect(html).toContain("bg-sio-bg-muted");
    expect(html).not.toContain("status-dot");
  });
});
