import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
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
    suggestedAction: "Call back before the SIP pause window closes.",
    evidence: [
      'quote: "Please pause my SIP this month"',
      'phrase: "pause my SIP"',
    ],
    status: "new",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SignalReviewSuggestedAction", () => {
  it("renders action and why as sibling cells", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, { signal: signal() }),
    );

    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Call back before the SIP pause window closes.");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("Phrase");
    expect(html).toContain("pause my SIP");
    expect(html).toContain("xl:grid-cols-2");
    expect(html).not.toContain("bg-sio-bg-muted/50");
  });

  it("shows honest empty copy when action and evidence are missing", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({ suggestedAction: "", evidence: [] }),
      }),
    );

    expect(html).toContain("Unavailable — local detection join missing.");
    expect(html).toContain("No local evidence.");
  });

  it("uses Neon stub honesty when the join is missing", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          id: "sig_neon_pred-1",
          suggestedAction: "",
          evidence: [],
        }),
      }),
    );

    expect(html).toContain("No local evidence — detection join missing.");
  });

  it("marks acted with locked SignalStatus and not-sent copy", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          status: "acted",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(html).toContain("Acted");
    expect(html).toContain("Marked as Acted — not sent.");
    expect(html).toContain("Call back before the SIP pause window closes.");
  });
});
