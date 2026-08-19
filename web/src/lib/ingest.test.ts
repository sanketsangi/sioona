import { describe, expect, it } from "vitest";
import {
  parseIngestDocument,
  parseIngestFile,
  stableConversationId,
  toStoreRecords,
} from "./ingest";

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

  it("parses CSV with newlines inside quoted content and ground_truth", () => {
    const csv = [
      "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
      'ml-1,customer,"Portfolio Feedback',
      "",
      'Risk: High",Asish,forum,2026-01-01T00:00:00.000Z,retention',
      "ml-1,agent,Sorry to hear that,Asish,forum,2026-01-01T00:01:00.000Z,retention",
      "ml-2,customer,Just need OTP help,Vikram,forum,2026-01-02T00:00:00.000Z,none",
    ].join("\n");

    const parsed = parseIngestFile("multiline.csv", csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].externalId).toBe("ml-1");
    expect(parsed[0].groundTruth).toBe("retention");
    expect(parsed[0].messages).toHaveLength(2);
    expect(parsed[0].messages[0].content).toContain("Portfolio Feedback");
    expect(parsed[0].messages[0].content).toContain("Risk: High");
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

  it("maps testing.json-shaped labels[] to groundTruth", () => {
    const json = JSON.stringify({
      conversations: [
        {
          externalId: "z_complaint",
          labels: [{ signal: "complaint", confidence: "high" }],
          messages: [{ role: "customer", content: "Kite is down" }],
        },
        {
          externalId: "z_mixed",
          labels: [
            { signal: "complaint" },
            { signal: "retention_risk" },
          ],
          messages: [{ role: "customer", content: "Closing my account after this" }],
        },
        {
          externalId: "z_explicit_wins",
          groundTruth: "lead",
          labels: [{ signal: "fraud" }],
          messages: [{ role: "customer", content: "Want to open demat" }],
        },
      ],
    });
    const parsed = parseIngestFile("batch_01.json", json);
    expect(parsed.map((c) => c.groundTruth)).toEqual([
      "none",
      "retention",
      "lead",
    ]);
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

  it("ignores invalid CSV ground_truth so unlabeled rows stay unlabeled", () => {
    const csv = [
      "conversation_id,role,content,ground_truth",
      "wa-1,customer,Want to open a demat account,churn",
      "wa-1,agent,Happy to help,churn",
    ].join("\n");
    const parsed = parseIngestFile("bad-gt.csv", csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].groundTruth).toBeUndefined();
  });

  it("unescapes doubled quotes inside CSV fields", () => {
    const csv = [
      "conversation_id,role,content",
      'q-1,customer,"She said ""close my account"" today"',
    ].join("\n");
    const parsed = parseIngestFile("quotes.csv", csv);
    expect(parsed[0].messages[0].content).toBe(
      'She said "close my account" today'
    );
  });

  it("maps JSON admin/support/bot roles to agent", () => {
    const json = JSON.stringify([
      {
        id: "roles-1",
        messages: [
          { role: "admin", content: "How can I help?" },
          { sender: "support", content: "Sharing the KYC link" },
          { author: "bot", content: "Auto-reply" },
          { role: "customer", content: "Thanks" },
        ],
      },
    ]);
    const parsed = parseIngestFile("roles.json", json);
    expect(parsed[0].messages.map((m) => m.role)).toEqual([
      "agent",
      "agent",
      "agent",
      "customer",
    ]);
  });

  it("sniffs WhatsApp exports even without a .txt filename", () => {
    const doc = parseIngestDocument("week2-export", WHATSAPP_FIXTURE);
    expect(doc.format).toBe("whatsapp_txt");
    expect(doc.conversations[0].channel).toBe("whatsapp");
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

  it("stableIds derives conversation id from externalId", () => {
    const first = toStoreRecords(
      [
        {
          externalId: "priya_sharma_22",
          messages: [{ role: "customer", content: "Hi" }],
        },
      ],
      "tenant_demo",
      { stableIds: true }
    );
    const second = toStoreRecords(
      [
        {
          externalId: "priya_sharma_22",
          messages: [{ role: "customer", content: "Hi again" }],
        },
      ],
      "tenant_demo",
      { stableIds: true }
    );
    expect(first.conversations[0].id).toBe("conv_priya_sharma_22");
    expect(second.conversations[0].id).toBe("conv_priya_sharma_22");
  });

  it("suffixes colliding stable ids so dual-write joins stay unique", () => {
    const used = new Set<string>();
    expect(stableConversationId("priya_sharma_22", used)).toBe(
      "conv_priya_sharma_22"
    );
    expect(stableConversationId("priya_sharma_22", used)).toBe(
      "conv_priya_sharma_22_2"
    );
    expect(stableConversationId("Priya Sharma 22", used)).toBe(
      "conv_priya_sharma_22_3"
    );
  });
});
