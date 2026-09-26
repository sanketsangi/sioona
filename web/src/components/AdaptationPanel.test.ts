import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Signal } from "@/lib/types";
import { AdaptationPanel, suggestTerm } from "./AdaptationPanel";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: unknown;
    className?: string;
  }) => createElement("a", { href, className }, children as never),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const SENTENCE =
  "This fired because they already hold a demat account and were only asking how to download the statement.";

function reviewed(partial: Pick<Signal, "id" | "evidence" | "feedback">): Signal {
  return {
    tenantId: "tenant_demo",
    conversationId: "conv_adapt",
    type: "lead",
    score: 0.8,
    confidence: 0.8,
    summary: "Lead",
    suggestedAction: "Follow up",
    status: "reviewed",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

function panelHtml(signals: Signal[]): string {
  return renderToStaticMarkup(
    createElement(AdaptationPanel, {
      signals,
      taxonomyOverrides: {},
    }),
  );
}

describe("AdaptationPanel suggestTerm", () => {
  it("pre-fills a phrase match and renders a sentence note beside the term", () => {
    expect(SENTENCE.length).toBeGreaterThan(80);
    const signal = reviewed({
      id: "sig_sentence",
      evidence: [
        'phrase: "demat account"',
        'quote: "how do I download the statement for my demat account"',
      ],
      feedback: {
        label: "incorrect",
        note: SENTENCE,
        reviewedAt: "2026-09-02T00:00:00.000Z",
      },
    });

    expect(suggestTerm(signal)).toBe("demat account");
    expect(suggestTerm(signal)).not.toBe(SENTENCE.slice(0, 80));

    const html = panelHtml([signal]);
    expect(html).toContain('value="demat account"');
    expect(html).not.toContain(`value="${SENTENCE.slice(0, 80)}"`);
    expect(html).toContain(SENTENCE);
    expect(html).toContain("Add Phrase");
    expect(html).toContain("Add Negative");
  });

  it("pre-fills a keyword the same way a phrase match does", () => {
    const signal = reviewed({
      id: "sig_keyword",
      evidence: ['keyword: "churn"'],
      feedback: {
        label: "incorrect",
        note: SENTENCE,
        reviewedAt: "2026-09-02T00:00:00.000Z",
      },
    });

    expect(suggestTerm(signal)).toBe("churn");
    expect(panelHtml([signal])).toContain('value="churn"');
  });

  it("pre-fills a short note when nothing matched", () => {
    const signal = reviewed({
      id: "sig_short",
      evidence: ['quote: "I want to know my balance"'],
      feedback: {
        label: "partially_correct",
        note: "not churn",
        reviewedAt: "2026-09-02T00:00:00.000Z",
      },
    });

    expect(suggestTerm(signal)).toBe("not churn");
    const html = panelHtml([signal]);
    expect(html).toContain('value="not churn"');
    expect(html).toContain("not churn");
  });

  it("does not slice a long note into the draft when nothing matched", () => {
    const signal = reviewed({
      id: "sig_long",
      evidence: [],
      feedback: {
        label: "incorrect",
        note: SENTENCE,
        reviewedAt: "2026-09-02T00:00:00.000Z",
      },
    });

    expect(suggestTerm(signal)).toBe("");
    const html = panelHtml([signal]);
    expect(html).toContain('value=""');
    expect(html).not.toContain(`value="${SENTENCE.slice(0, 80)}"`);
    expect(html).toContain(SENTENCE);
  });
});
