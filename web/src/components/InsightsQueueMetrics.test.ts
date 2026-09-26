import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Signal } from "@/lib/types";
import { InsightsQueueMetrics } from "./InsightsQueueMetrics";

function signal(conversationId: string): Signal {
  return {
    id: `sig_${conversationId}`,
    tenantId: "tenant_demo",
    conversationId,
    type: "lead",
    score: 1,
    confidence: 1,
    summary: "",
    suggestedAction: "",
    evidence: [],
    status: "new",
    createdAt: "2026-09-26T00:00:00.000Z",
  };
}

function renderFooter(opts: {
  reviewedCount?: number | null;
  correctCount?: number | null;
}) {
  return renderToStaticMarkup(
    createElement(InsightsQueueMetrics, {
      conversationCount: 0,
      signals: [],
      pendingSignals: [],
      reviewedCount: opts.reviewedCount,
      correctCount: opts.correctCount,
    }),
  );
}

describe("InsightsQueueMetrics coverage", () => {
  it("shows the share of conversations that have a signal", () => {
    const html = renderToStaticMarkup(
      createElement(InsightsQueueMetrics, {
        conversationCount: 100,
        signals: [signal("conv_a"), signal("conv_a"), signal("conv_b")],
        pendingSignals: [],
      }),
    );

    expect(html).toContain('aria-label="2% of conversations have a signal"');
    expect(html).toContain("+2%");
  });
});

describe("InsightsQueueMetrics week footer", () => {
  it("online week score shows correct/reviewed beside n of 5", () => {
    const html = renderFooter({ reviewedCount: 6, correctCount: 5 });

    expect(html).toContain("This week 6 of 5 reviews · 5/6 correct");
    expect(html).not.toContain("Review 5 chats this week");
    expect(html).not.toMatch(/>Go</);
    expect(html).not.toMatch(/>Hold</);
    expect(html).not.toMatch(/>83%</);
  });

  it("empty week window keeps the review 5 chats line", () => {
    const html = renderFooter({ reviewedCount: 0, correctCount: 0 });

    expect(html).toContain("Review 5 chats this week");
    expect(html).not.toContain("of 5 reviews");
    expect(html).not.toMatch(/\d+\/\d+ correct/);
    expect(html).not.toMatch(/>Go</);
  });

  it("offline week score omits the footer and does not invent a ratio or Go", () => {
    const html = renderFooter({ reviewedCount: null, correctCount: null });

    expect(html).not.toContain("Review 5 chats this week");
    expect(html).not.toContain("of 5 reviews");
    expect(html).not.toMatch(/\d+\/\d+ correct/);
    expect(html).not.toMatch(/>Go</);
    expect(html).toContain('aria-label="Queue metrics"');
  });
});
