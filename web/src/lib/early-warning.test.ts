import { describe, expect, it } from "vitest";
import { detectEarlyWarnings } from "./early-warning";
import type { Conversation, Message } from "./types";

function chat(id: string, name: string, startedAt: string): Conversation {
  return {
    id,
    tenantId: "tenant_demo",
    channel: "whatsapp",
    customerName: name,
    startedAt,
    messageIds: [],
  };
}

function msg(
  id: string,
  conversationId: string,
  role: Message["role"],
  content: string,
  timestamp: string
): Message {
  return { id, conversationId, role, content, timestamp };
}

describe("detectEarlyWarnings", () => {
  it("flags payout failure, a slow reply, and a worsening trend without emitting a retention signal", () => {
    const warnings = detectEarlyWarnings(
      [
        chat("c1", "Asha", "2026-09-01T00:00:00.000Z"),
        chat("c2", "Asha", "2026-09-20T00:00:00.000Z"),
      ],
      [
        msg("m1", "c1", "customer", "Thanks, the account looks good.", "2026-09-01T01:00:00.000Z"),
        msg("m2", "c1", "agent", "Glad to help.", "2026-09-01T01:05:00.000Z"),
        msg(
          "m3",
          "c2",
          "customer",
          "Withdrawal failed again. This is the worst service.",
          "2026-09-20T01:00:00.000Z"
        ),
        msg("m4", "c2", "agent", "Checking.", "2026-09-20T08:00:00.000Z"),
      ]
    );
    const kinds = warnings.map((row) => row.kind);
    expect(kinds).toContain("failed_payout");
    expect(kinds).toContain("slow_reply");
    expect(kinds).toContain("sentiment_trend");
    expect(warnings.every((row) => !("type" in row && row.type === "retention"))).toBe(
      true
    );
  });

  it("flags an unresolved complaint that no agent later closes", () => {
    const warnings = detectEarlyWarnings(
      [chat("c1", "Ravi", "2026-09-02T00:00:00.000Z")],
      [
        msg(
          "m1",
          "c1",
          "customer",
          "Still waiting, no update on the complaint.",
          "2026-09-02T01:00:00.000Z"
        ),
        msg("m2", "c1", "agent", "We will check.", "2026-09-02T01:10:00.000Z"),
      ]
    );
    expect(warnings.map((row) => row.kind)).toContain("unresolved");
    expect(warnings.find((row) => row.kind === "unresolved")?.reason).toMatch(/waiting/i);
  });
});
