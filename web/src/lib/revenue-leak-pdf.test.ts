import { describe, expect, it } from "vitest";
import { buildRevenueLeakPdf, revenueLeakPdfLines } from "./revenue-leak-pdf";
import { buildRevenueLeakReport } from "./revenue-leak";
import type { Signal } from "./types";

const signal: Signal = {
  id: "sig_1",
  tenantId: "tenant_demo",
  conversationId: "conv_1",
  type: "retention",
  score: 0.9,
  confidence: 0.9,
  summary: "May leave",
  suggestedAction: "Call",
  evidence: ["closing my account today, portfolio ₹50,000"],
  status: "new",
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("revenue leak pdf", () => {
  it("omits the customer name and starts with a PDF header", () => {
    const report = buildRevenueLeakReport({
      signals: [signal],
      conversations: [
        {
          id: "conv_1",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          customerName: "Secret Name",
          startedAt: "2026-10-01T00:00:00.000Z",
          messageIds: [],
        },
      ],
      messages: [],
      windowLabel: "Last 7 days",
    });
    const lines = revenueLeakPdfLines(report).join("\n");
    expect(lines).not.toContain("Secret Name");
    expect(lines).toContain("Anonymised");
    expect(lines).toContain("INR 50,000");
    const bytes = buildRevenueLeakPdf(report);
    const header = new TextDecoder().decode(bytes.slice(0, 8));
    expect(header).toBe("%PDF-1.4");
    expect(new TextDecoder().decode(bytes)).toContain("%%EOF");
  });
});
