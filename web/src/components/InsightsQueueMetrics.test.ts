import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsQueueMetrics } from "./InsightsQueueMetrics";

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
