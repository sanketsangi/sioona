import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { runDetection } from "./detect";
import { computeEvalMetrics } from "./eval";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import { formatPartnerExportMetrics } from "./partner-export-eval";
import { containsPii } from "./redact";

const PILOT_DIR = path.join(process.cwd(), "data/samples/pilot");
const CSV_NAME = "kuber_week_1_batch_1.csv";
const INTERCOM_NAME = "kuber_week_1_intercom.json";
const WHATSAPP_NAME = "kuber_week_1_whatsapp.txt";
const TENANT_ID = "tenant_partner";

const DEVANAGARI = /[\u0900-\u097F]/;
const HINGLISH =
  /\b(hai|nahi|nahin|bhai|bahut|paisa|kya|mera|meri|zyada|abhi|aaj|mahine|hafte|raha|rahi|hoon|kar|chahiye)\b/i;
const AMOUNT =
  /(?:₹\s*\d|\d+(?:\.\d+)?\s*(?:lakh|lakhs|lac|lacs|crore|crores|\bcr\b))/i;

/** Obviously fake shapes that must be present raw and absent after redactText. */
const RAW_PII = [
  "9811100001",
  "98450 11013",
  "9811100022",
  "9700002211",
  "9811100023",
  "nikhil.bansal@example.com",
  "desk-test@example.com",
  "meera.kulkarni@example.com",
  "QQQQQ1111B",
  "ZZZZZ0001A",
  "meera.k@oksbi",
  "rahulmenon@ybl",
  "poojareddy@paytm",
  "lakshmi.iyer@okaxis",
  "HDFC0001234",
  "ICIC0001111",
  "SBIN0002222",
  "KU998877",
  "KB123456",
  "ZX100200",
  "14/08/1992",
  "02/11/1988",
  "Sample Marg",
  "500034",
  "560001",
  "1111 2222 3333",
  "998877665544332",
  "Meera Kulkarni",
];

function customerBlob(
  messages: { role: string; content: string }[]
): string {
  return messages
    .filter((message) => message.role === "customer")
    .map((message) => message.content)
    .join("\n");
}

function languageOf(text: string): "en" | "hi-en" | "hi" {
  if (DEVANAGARI.test(text)) return "hi";
  if (HINGLISH.test(text)) return "hi-en";
  return "en";
}

describe("Kuber Securities synthetic week-1 pilot", () => {
  it("parses, redacts, and prints heuristic precision and recall", () => {
    const csv = readFileSync(path.join(PILOT_DIR, CSV_NAME), "utf8");
    const doc = parseIngestDocument(CSV_NAME, csv);

    expect(doc.format).toBe("sioona_csv");
    expect(doc.conversations).toHaveLength(120);

    const counts = { lead: 0, retention: 0, upsell: 0, none: 0 };
    const langs = { en: 0, "hi-en": 0, hi: 0 };
    const byCustomer = new Map<string, number>();
    let signalAmounts = 0;

    for (const conversation of doc.conversations) {
      const gt = conversation.groundTruth;
      expect(gt).toBeTruthy();
      counts[gt!] += 1;
      const text = customerBlob(conversation.messages);
      langs[languageOf(text)] += 1;
      expect(conversation.messages.length).toBeGreaterThanOrEqual(3);
      expect(conversation.messages.length).toBeLessThanOrEqual(15);
      const name = conversation.customerName ?? "";
      byCustomer.set(name, (byCustomer.get(name) ?? 0) + 1);
      if (gt !== "none" && AMOUNT.test(text)) signalAmounts += 1;
    }

    expect(counts).toEqual({ lead: 15, retention: 25, upsell: 15, none: 65 });
    expect(langs).toEqual({ en: 60, "hi-en": 42, hi: 18 });
    expect(signalAmounts).toBe(30);

    const repeats = [...byCustomer.entries()].filter(([, n]) => n >= 2);
    expect(repeats).toHaveLength(8);
    for (const [, n] of repeats) {
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }

    for (const token of RAW_PII) {
      expect(csv.toLowerCase()).toContain(token.toLowerCase());
    }

    const { conversations, messages } = toStoreRecords(
      doc.conversations,
      TENANT_ID,
      { stableIds: true }
    );
    const stored = messages.map((message) => message.content).join("\n");
    expect(containsPii(stored)).toBe(false);
    for (const token of RAW_PII) {
      expect(stored.toLowerCase()).not.toContain(token.toLowerCase());
    }
    expect(stored).toMatch(/\[phone\]/);
    expect(stored).toMatch(/\[email\]/);
    expect(stored).toMatch(/\[pan\]/);
    expect(stored).toMatch(/\[upi\]/);
    expect(stored).toMatch(/\[ifsc\]/);
    expect(stored).toMatch(/\[broker-id\]/);
    expect(stored).toMatch(/\[dob\]/);
    expect(stored).toMatch(/\[address\]/);
    expect(stored).toMatch(/\[pin\]/);
    expect(stored).toMatch(/\[aadhaar\]/);
    expect(stored).toMatch(/\[account\]/);
    expect(stored).toContain("₹8 lakh");
    expect(conversations.every((row) => /^Customer [0-9a-f]{8}$/.test(row.customerName ?? ""))).toBe(true);

    const signals = runDetection(conversations, messages, TENANT_ID);
    const opsIds = new Set(
      conversations
        .filter((_, index) => doc.conversations[index].externalId?.startsWith("kuber_w1_ops_"))
        .map((row) => row.id)
    );
    expect(opsIds.size).toBe(20);
    const opsFired = signals
      .filter((signal) => opsIds.has(signal.conversationId))
      .map((signal) => signal.type);
    expect(opsFired).toEqual([]);

    const metrics = computeEvalMetrics({
      tenant: {
        id: TENANT_ID,
        name: "Kuber Securities pilot",
        createdAt: "2026-09-21T00:00:00.000Z",
      },
      conversations,
      messages,
      signals,
      pilot: { baselineOpportunities: 0 },
    });

    expect(metrics.labeledConversations).toBe(120);
    expect(metrics.byType.map((row) => [row.type, row.labeledCount])).toEqual([
      ["lead", 15],
      ["retention", 25],
      ["upsell", 15],
    ]);
    // Baseline only. Do not fail the pack when heuristic P/R moves.
    expect(typeof metrics.labeledPrecision).toBe("number");
    expect(typeof metrics.labeledRecall).toBe("number");
    for (const row of metrics.byType) {
      expect(row.precision === null || typeof row.precision === "number").toBe(true);
      expect(row.recall === null || typeof row.recall === "number").toBe(true);
    }

    console.log(`kuber-pilot heuristic\n${formatPartnerExportMetrics(metrics)}`);

    const intercomText = readFileSync(path.join(PILOT_DIR, INTERCOM_NAME), "utf8");
    const intercom = parseIngestDocument(INTERCOM_NAME, intercomText);
    expect(intercom.format).toBe("intercom_json");
    expect(intercom.conversations).toHaveLength(20);
    const csvIds = new Set(doc.conversations.map((row) => row.externalId));
    expect(
      intercom.conversations.every(
        (row) => row.externalId?.startsWith("kuber_w1_ic_") && !csvIds.has(row.externalId),
      ),
    ).toBe(true);
    expect(intercom.conversations.some((row) => row.messages.some((message) => message.role === "system"))).toBe(true);
    const intercomStored = toStoreRecords(intercom.conversations, TENANT_ID, {
      stableIds: true,
    }).messages.map((message) => message.content).join("\n");
    expect(containsPii(intercomStored)).toBe(false);
    expect(intercomStored).not.toContain("9811100001");
    expect(intercomStored).not.toContain("meera.k@oksbi");

    const whatsappText = readFileSync(path.join(PILOT_DIR, WHATSAPP_NAME), "utf8");
    const whatsapp = parseIngestDocument(WHATSAPP_NAME, whatsappText);
    expect(whatsapp.format).toBe("whatsapp_txt");
    expect(whatsapp.conversations.length).toBeGreaterThan(0);
    expect(whatsapp.conversations[0]?.messages.length).toBeGreaterThan(20);
    for (const message of whatsapp.conversations[0].messages) {
      const stamp = new Date(message.timestamp ?? "");
      expect(stamp.getFullYear()).toBe(2026);
      expect(stamp.getMonth()).toBe(8);
      expect(stamp.getDate()).toBeGreaterThanOrEqual(21);
      expect(stamp.getDate()).toBeLessThanOrEqual(27);
    }
    const whatsappStored = toStoreRecords(whatsapp.conversations, TENANT_ID, {
      stableIds: true,
    }).messages.map((message) => message.content).join("\n");
    expect(containsPii(whatsappStored)).toBe(false);
    expect(whatsappStored).not.toContain("9811100001");
    expect(whatsappStored.toLowerCase()).not.toContain("meera kulkarni");
    expect(whatsappStored).toContain("close my account");
  });
});
