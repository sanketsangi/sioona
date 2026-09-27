import { describe, expect, it } from "vitest";
import {
  bundledShowcaseConversationIds,
  omitBundledShowcaseChats,
} from "./showcase-keep-set";
import type { StoreData } from "./types";

const week7 = "Zerodha_week_7_batch_01.json";

function store(overrides: Partial<StoreData> = {}): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [],
    messages: [],
    signals: [],
    pilot: { baselineOpportunities: 0, lastUploadedFileName: week7 },
    ...overrides,
  };
}

describe("omitBundledShowcaseChats", () => {
  it("names the Groww rows that must leave a week 7 keep-set", async () => {
    const ids = await bundledShowcaseConversationIds();
    expect(ids.has("conv_rucha_patwardhan_12")).toBe(true);
    expect(ids.has("conv_kavitha_reddy_24")).toBe(true);
    expect(ids.has("conv_waseem_qazi_06")).toBe(true);
    expect(ids.has("conv_rohan_kamble_55")).toBe(true);
  });

  it("drops showcase chats and signals and keeps the uploaded file", async () => {
    const ids = await bundledShowcaseConversationIds();
    const mixed = store({
      conversations: [
        {
          id: "conv_rucha_patwardhan_12",
          tenantId: "tenant_demo",
          channel: "in_app_chat",
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: ["msg_rucha"],
          customerName: "Rucha Patwardhan",
        },
        {
          id: "conv_aditya",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          startedAt: "2026-09-27T12:00:00.000Z",
          messageIds: ["msg_aditya"],
          customerName: "Aditya Pawar",
          sourceFile: week7,
        },
      ],
      messages: [
        {
          id: "msg_rucha",
          conversationId: "conv_rucha_patwardhan_12",
          role: "customer",
          content: "showcase",
          timestamp: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "msg_aditya",
          conversationId: "conv_aditya",
          role: "customer",
          content: "week 7",
          timestamp: "2026-09-27T12:00:00.000Z",
        },
      ],
      signals: [
        {
          id: "sig_rucha",
          tenantId: "tenant_demo",
          conversationId: "conv_rucha_patwardhan_12",
          type: "lead",
          score: 0.8,
          confidence: 0.8,
          summary: "Groww",
          suggestedAction: "Call",
          evidence: ["showcase"],
          status: "new",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "sig_aditya",
          tenantId: "tenant_demo",
          conversationId: "conv_aditya",
          type: "retention",
          score: 0.9,
          confidence: 0.9,
          summary: "Week 7",
          suggestedAction: "Call",
          evidence: ["week 7"],
          status: "new",
          createdAt: "2026-09-27T12:00:00.000Z",
        },
      ],
    });

    const dropped = omitBundledShowcaseChats(mixed, ids);

    expect(dropped.conversations.map((row) => row.customerName)).toEqual([
      "Aditya Pawar",
    ]);
    expect(dropped.messages.map((row) => row.id)).toEqual(["msg_aditya"]);
    expect(dropped.signals.map((row) => row.id)).toEqual(["sig_aditya"]);
  });

  it("leaves Sample alone when that pack is the keep-set", async () => {
    const ids = await bundledShowcaseConversationIds();
    const sample = store({
      pilot: { baselineOpportunities: 0, lastUploadedFileName: "Groww_batch_02" },
      conversations: [
        {
          id: "conv_rucha_patwardhan_12",
          tenantId: "tenant_demo",
          channel: "in_app_chat",
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
          customerName: "Rucha Patwardhan",
        },
      ],
    });

    expect(omitBundledShowcaseChats(sample, ids)).toBe(sample);
  });
});
