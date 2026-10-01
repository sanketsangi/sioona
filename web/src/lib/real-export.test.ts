import { describe, expect, it } from "vitest";

import { runDetection } from "./detect";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import { containsPii, pseudonymCustomerName } from "./redact";

const EXPORT = `conversation_id,role,content,customer_name,channel
wa_001,customer,"Please close my account. My number is +91 98765 43210 and UPI is asha@okaxis. Client code AB123456. DOB: 01/02/1990.",Asha Mehta,whatsapp
wa_001,agent,"I can help with the closure request.",Asha Mehta,whatsapp
`;

describe("real partner export path", () => {
  it("redacts, pseudonymizes, and still detects a retention signal", () => {
    const doc = parseIngestDocument("real-partner-export.local.csv", EXPORT);
    const stored = toStoreRecords(doc.conversations, "tenant_partner", {
      stableIds: true,
    });
    const conversation = stored.conversations[0];
    expect(conversation.customerName).toBe(pseudonymCustomerName("Asha Mehta"));
    expect(conversation.customerName).not.toContain("Asha");
    const blob = stored.messages.map((message) => message.content).join("\n");
    expect(blob).not.toMatch(/98765/);
    expect(blob).not.toMatch(/asha@okaxis/i);
    expect(blob).not.toMatch(/AB123456/);
    expect(blob).not.toMatch(/01\/02\/1990/);
    expect(blob).not.toContain("Asha Mehta");
    expect(containsPii(blob)).toBe(false);
    const signals = runDetection(
      stored.conversations,
      stored.messages,
      "tenant_partner",
    );
    expect(signals.some((signal) => signal.type === "retention")).toBe(true);
  });
});
