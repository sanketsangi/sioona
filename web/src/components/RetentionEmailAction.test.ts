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
  queueActionLabelForSignal,
  RetentionEmailAction,
} from "@/components/RetentionEmailAction";
import { createRetentionEmailAction } from "@/lib/supervised-actions";
import type { Signal } from "@/lib/types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "Close account",
    suggestedAction: "Call back",
    evidence: ['quote: "I want to close my account"'],
    status: "new",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("queueActionLabelForSignal", () => {
  it("returns Approve for high-confidence retention", () => {
    expect(queueActionLabelForSignal(signal(), "Priya")).toBe("Approve");
  });

  it("returns Review for lead signals without a stored action", () => {
    expect(
      queueActionLabelForSignal(
        signal({ type: "lead", confidence: 0.95 }),
        "Rahul",
      ),
    ).toBe("Review");
  });

  it("returns Approve when a stored retention draft exists", () => {
    const stored = createRetentionEmailAction({
      signal: signal({ type: "lead", confidence: 0.4 }),
      customerName: "Priya",
    });
    expect(
      queueActionLabelForSignal(
        signal({ type: "lead", confidence: 0.4 }),
        "Priya",
        stored,
      ),
    ).toBe("Approve");
  });
});

describe("RetentionEmailAction", () => {
  it("shows evidence and draft side by side with decision buttons", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );

    expect(html).toContain("Retention Email");
    expect(html).toContain("Pending");
    expect(html).toContain("Approve Draft");
    expect(html).not.toContain("Approve &amp; Send");
    expect(html).toContain("Edit");
    expect(html).toContain("Dismiss");
    expect(html).toContain("Evidence");
    expect(html).toContain("Draft");
    expect(html).toContain("I want to close my account");
    expect(html).toContain("Checking in on your account");
    expect(html).toContain("Hi Priya,");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("the email is not sent");
    expect(html).toContain("Records approval. Does not send the email.");
    expect(html).toContain("data-review-slot=\"retention-email\"");
  });

  it("renders nothing for lead signals without a stored action", () => {
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal({ type: "lead", confidence: 0.95 }),
        customerName: "Rahul",
      }),
    );
    expect(html).toBe("");
  });

  it("shows the decided state without action buttons", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    action.status = "approved";
    action.decidedAt = "2026-09-02T00:00:00.000Z";
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );
    expect(html).toContain("Approved — not sent.");
    expect(html).not.toContain("Approve &amp; Send");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Dismiss<");
  });
});
