import { describe, expect, it } from "vitest";
import { parseIngestDocument, parseIngestFile, toStoreRecords } from "./ingest";

/** Minimal Intercom-shaped fixture (showcase sample files removed). */
const INTERCOM_FIXTURE = JSON.stringify({
  conversations: [
    {
      type: "conversation",
      id: "ic_9001",
      created_at: 1754121600,
      source: {
        type: "conversation",
        body: "<p>Hi, I want to open a demat account this week.</p>",
        created_at: 1754121600,
        author: { type: "user", name: "Asha Mehta" },
      },
      conversation_parts: {
        conversation_parts: [
          {
            part_type: "comment",
            body: "<p>Happy to help!</p>",
            created_at: 1754121660,
            author: { type: "admin", name: "Support" },
          },
        ],
      },
    },
    {
      type: "conversation",
      id: "ic_9002",
      created_at: 1754208000,
      source: {
        type: "conversation",
        body: "Existing customer — enable F&O and margin trading on my account?",
        created_at: 1754208000,
        author: { type: "user", name: "Farhan Ali" },
      },
      conversation_parts: {
        conversation_parts: [
          {
            part_type: "comment",
            body: "I can share eligibility.",
            created_at: 1754208060,
            author: { type: "admin", name: "Support" },
          },
        ],
      },
    },
  ],
});

const WHATSAPP_FIXTURE = [
  "[02/08/2026, 11:05:00 AM] Neha Singh: I already trade equity — do you offer a premium advisory plan?",
  "[02/08/2026, 11:06:00 AM] You: Yes, we have a wealth manager tier.",
  "[02/08/2026, 11:07:10 AM] Neha Singh: Need higher limits and portfolio review.",
].join("\n");

describe("parseIngestFile", () => {
  it("parses CSV with quoted commas and ground truth", () => {
    const csv = [
      "conversation_id,role,content,customer_name,channel,ground_truth",
      'wa-1,customer,"Hi, I want to open a demat account",Asha,whatsapp,lead',
      "wa-1,agent,Happy to help,Asha,whatsapp,lead",
      "wa-2,customer,Just need my statement PDF,Vikram,website_chat,none",
    ].join("\n");

    const parsed = parseIngestFile("chats.csv", csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].externalId).toBe("wa-1");
    expect(parsed[0].customerName).toBe("Asha");
    expect(parsed[0].groundTruth).toBe("lead");
    expect(parsed[0].messages[0].content).toContain("want to open");
    expect(parsed[1].groundTruth).toBe("none");
  });

  it("parses JSON conversation arrays", () => {
    const json = JSON.stringify([
      {
        externalId: "j-1",
        channel: "intercom",
        customerName: "Priya",
        groundTruth: "retention",
        messages: [
          { role: "customer", content: "Thinking of leaving" },
          { role: "agent", content: "Sorry about that" },
        ],
      },
    ]);
    const parsed = parseIngestFile("export.json", json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].groundTruth).toBe("retention");
    expect(parsed[0].messages).toHaveLength(2);
  });

  it("accepts id as externalId and text as content", () => {
    const json = JSON.stringify({
      conversations: [
        {
          id: "fintech_001",
          messages: [
            { role: "customer", text: "Should KYC be built into the stack?" },
          ],
        },
      ],
    });
    const parsed = parseIngestFile("tiger.json", json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].externalId).toBe("fintech_001");
    expect(parsed[0].messages[0].content).toContain("KYC");
  });

  it("rejects JSON without conversations", () => {
    expect(() => parseIngestFile("bad.json", '{"ok":true}')).toThrow(
      /conversations/
    );
  });

  it("rejects conversations with empty messages", () => {
    expect(() =>
      parseIngestFile(
        "empty.json",
        JSON.stringify({ conversations: [{ id: "x", messages: [] }] })
      )
    ).toThrow(/usable conversations/);
  });

  it("parses Intercom conversation JSON exports", () => {
    const doc = parseIngestDocument("partner-intercom.json", INTERCOM_FIXTURE);
    expect(doc.format).toBe("intercom_json");
    expect(doc.conversations.length).toBeGreaterThanOrEqual(2);
    expect(doc.conversations[0].channel).toBe("intercom");
    expect(doc.conversations[0].customerName).toBe("Asha Mehta");
    expect(doc.conversations[0].messages.some((m) => m.role === "customer")).toBe(
      true
    );
    expect(doc.conversations[0].messages[0].content).toContain("demat");
    expect(doc.conversations[1].customerName).toBe("Farhan Ali");
    expect(
      doc.conversations.some((c) =>
        c.messages.some((m) => /f&o|margin trading/i.test(m.content))
      )
    ).toBe(true);
  });

  it("parses WhatsApp Business .txt exports", () => {
    const doc = parseIngestDocument("partner-whatsapp.txt", WHATSAPP_FIXTURE);
    expect(doc.format).toBe("whatsapp_txt");
    expect(doc.conversations).toHaveLength(1);
    expect(doc.conversations[0].channel).toBe("whatsapp");
    expect(doc.conversations[0].customerName).toBe("Neha Singh");
    expect(doc.conversations[0].messages.length).toBeGreaterThanOrEqual(3);
    expect(doc.conversations[0].messages[1].role).toBe("agent");
    expect(doc.conversations[0].messages[0].content).toContain("premium advisory");
  });
});

describe("toStoreRecords", () => {
  it("maps ingest inputs into tenant-scoped store records", () => {
    const { conversations, messages } = toStoreRecords(
      [
        {
          externalId: "ext-9",
          channel: "whatsapp",
          customerName: "Test",
          groundTruth: "upsell",
          messages: [
            { role: "customer", content: "Do you offer a pro plan?" },
            { role: "agent", content: "Yes" },
          ],
        },
      ],
      "tenant_demo"
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0].tenantId).toBe("tenant_demo");
    expect(conversations[0].externalId).toBe("ext-9");
    expect(conversations[0].groundTruth).toBe("upsell");
    expect(conversations[0].messageIds).toHaveLength(2);
    expect(messages).toHaveLength(2);
    expect(messages.every((m) => m.conversationId === conversations[0].id)).toBe(
      true
    );
  });

  it("skips conversations with no messages", () => {
    const result = toStoreRecords(
      [{ messages: [] }, { messages: [{ role: "customer", content: "Hi" }] }],
      "tenant_demo"
    );
    expect(result.conversations).toHaveLength(1);
    expect(result.messages).toHaveLength(1);
  });
});
