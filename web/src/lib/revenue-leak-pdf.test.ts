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
      messages: [{ id: "m1", conversationId: "conv_1", role: "customer", content: "closing my account today, portfolio INR 50000", timestamp: "2026-10-01" }],
      windowLabel: "Last 7 days",
    });
    const lines = revenueLeakPdfLines(report).join("\n");
    expect(lines).not.toContain("Secret Name");
    expect(lines).toContain("Anonymised");
    expect(lines).toContain("Asset exposure estimate INR 50,000");
    expect(lines).toContain("Revenue opportunity estimate INR 0");
    expect(lines).toContain("Unconfirmed value INR 0");
    expect(lines).toContain("Confirmed saved (reviewer-recorded) INR 0");
    const bytes = buildRevenueLeakPdf(report);
    const header = new TextDecoder().decode(bytes.slice(0, 8));
    expect(header).toBe("%PDF-1.4");
    expect(new TextDecoder().decode(bytes)).toContain("%%EOF");
  });
});

it("continues dense reports without losing the final customer", () => {
  const signals = Array.from({ length: 100 }, (_, index) => ({ ...signal,
    id: `s${index}`, conversationId: `c${index}`, evidence: ["closing my account this week, portfolio INR 50000"] }));
  const report = buildRevenueLeakReport({ signals, conversations: [], messages: signals.map((signal) => ({ id: `m${signal.id}`, conversationId: signal.conversationId, role: "customer" as const, content: signal.evidence[0], timestamp: "2026-10-01" })), windowLabel: "From 1 Oct 2026" });
  const pdf = new TextDecoder().decode(buildRevenueLeakPdf(report));
  expect(Number(/\/Type \/Pages \/Count (\d+)/.exec(pdf)?.[1])).toBeGreaterThan(1);
  expect(pdf).toContain(report.customersAtRisk[99].customerLabel);
  expect(pdf).toContain("Text-derived");
  expect(pdf).toContain("asset value");
  const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  expect(pdf.slice(xref, xref + 4)).toBe("xref");
});

it("wraps oversized tokens without dropping their characters", () => {
  const report = buildRevenueLeakReport({ signals: [], conversations: [], messages: [],
    windowLabel: "W".repeat(250) });
  const pdf = new TextDecoder().decode(buildRevenueLeakPdf(report));
  const lines = [...pdf.matchAll(/\(([^()]*)\) Tj/g)].map((match) => match[1]);
  expect(lines.every((line) => line.length <= 48)).toBe(true);
  expect(lines.filter((line) => /^W+$/.test(line)).join("")).toBe("W".repeat(250));
});
