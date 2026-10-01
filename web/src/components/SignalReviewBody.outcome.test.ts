import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Conversation, Message, Signal, StoreData } from "@/lib/types";

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    [key: string]: unknown;
  }) => {
    const { href, children, className, ...rest } = props;
    return createElement("a", { href, className, ...rest }, children as never);
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { SignalReviewBody } from "@/components/SignalReviewBody";
import { RevenueLeakReportView } from "@/components/views/RevenueLeakReportView";

const OUTCOME_LABEL = "Record outcome. 1 Saved, 2 Lost, 3 Converted. Nothing is sent.";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_conv_kuber_w1_ic_arjun_03_retention_0",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "Customer may leave",
    suggestedAction: "Call back before the SIP pause window closes.",
    evidence: ["I am closing my account today"],
    status: "new",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function message(): Message {
  return {
    id: "msg_1",
    conversationId: "conv_1",
    role: "customer",
    content: "I am closing my account today",
    timestamp: "2026-10-01T10:05:00.000Z",
  };
}

function conversation(): Conversation {
  return {
    id: "conv_1",
    tenantId: "tenant_demo",
    channel: "whatsapp",
    customerName: "Arjun",
    startedAt: "2026-10-01T00:00:00.000Z",
    messageIds: ["msg_1"],
  };
}

describe("Saved / Lost / Converted placement", () => {
  it("omits the outcome control from the Insights review rail", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewBody, {
        signal: signal(),
        messages: [message()],
        customerName: "Arjun",
        conversation: conversation(),
      }),
    );
    expect(html).toContain("insights-review-rail");
    expect(html).not.toContain(OUTCOME_LABEL);
    expect(html).not.toContain(">Saved<");
  });

  it("keeps the outcome control on the revenue report", async () => {
    const store: StoreData = {
      tenant: {
        id: "tenant_demo",
        name: "Demo",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      conversations: [conversation()],
      messages: [message()],
      signals: [signal()],
    };
    const html = renderToStaticMarkup(
      await RevenueLeakReportView({
        store,
        backendScore: null,
        windowLabel: "This week",
        anonymised: true,
      }),
    );
    expect(html).toContain(OUTCOME_LABEL);
    expect(html).toContain(">Saved<");
    expect(html).toContain(">Lost<");
    expect(html).toContain(">Converted<");
  });
});
