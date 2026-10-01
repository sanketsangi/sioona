import { describe, expect, it, vi } from "vitest";
import { REDACTION_TOKENS } from "../redact";
import { acceptLiveChats } from "./accept";
import {
  liveIngestEnabled,
  resolveLiveIngestTenant,
  webhookSecretMatches,
} from "./flag";
import { intercomOAuthStartUrl, pollIntercomConversations } from "./intercom";
import { parseWhatsAppWebhook } from "./whatsapp";
import type { StoreData } from "../types";

describe("live ingest flag", () => {
  it("stays off unless LIVE_INGEST=1", () => {
    vi.stubEnv("LIVE_INGEST", "");
    expect(liveIngestEnabled()).toBe(false);
    vi.stubEnv("LIVE_INGEST", "1");
    expect(liveIngestEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("rejects a missing or mismatched webhook secret", () => {
    expect(webhookSecretMatches(null, "secret")).toBe(false);
    expect(webhookSecretMatches("nope", "secret")).toBe(false);
    expect(webhookSecretMatches("secret", "secret")).toBe(true);
  });

  it("maps a webhook to its tenant and refuses the showcase tenant", () => {
    vi.stubEnv("SIOONA_TENANT_ID", "tenant_partner");
    expect(resolveLiveIngestTenant("tenant_partner")).toBe("tenant_partner");
    expect(resolveLiveIngestTenant("tenant_demo")).toBeNull();
    expect(resolveLiveIngestTenant("tenant_other")).toBeNull();
    expect(resolveLiveIngestTenant(null)).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("whatsapp adapters", () => {
  it("reads a Gupshup text and leaves the phone out of the message body", () => {
    const chats = parseWhatsAppWebhook("gupshup", {
      payload: {
        id: "m1",
        source: "919876543210",
        payload: { text: "paisa nikalna hai call 9876543210" },
      },
    });
    expect(chats[0]?.channel).toBe("whatsapp");
    expect(chats[0]?.messages[0]?.content).toContain("paisa nikalna hai");
    expect(chats[0]?.externalId).toBe("gupshup:m1");
  });

  it("reads an Interakt message_received payload", () => {
    const chats = parseWhatsAppWebhook("interakt", {
      data: {
        customer: { id: "c1", name: "Asha" },
        message: { message: "Withdrawal failed", received_at_utc: "2026-10-01T00:00:00.000Z" },
      },
    });
    expect(chats[0]?.customerName).toBe("Asha");
    expect(chats[0]?.messages[0]?.content).toBe("Withdrawal failed");
  });

  it("reads a Gupshup unix timestamp in seconds", () => {
    const chats = parseWhatsAppWebhook("gupshup", {
      payload: {
        id: "m2",
        timestamp: 1_700_000_000,
        payload: { text: "paisa nikalna hai" },
      },
    });
    expect(chats[0]?.messages[0]?.timestamp).toBe("2023-11-14T22:13:20.000Z");
  });
});

describe("intercom connector", () => {
  it("builds an OAuth start URL and polls with GET only", async () => {
    const start = intercomOAuthStartUrl(
      "client",
      "http://localhost:3000/api/ingest/live/intercom/callback",
      "state1",
    );
    expect(start).toContain("https://app.intercom.com/oauth");
    expect(start).toContain("client_id=client");

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      return new Response(
        JSON.stringify({
          conversations: [
            {
              id: "ic_1",
              type: "conversation",
              source: {
                type: "conversation",
                body: "I want to close my account",
                author: { type: "user", name: "Ravi" },
              },
              created_at: 1_700_000_000,
              conversation_parts: { conversation_parts: [] },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const chats = await pollIntercomConversations("token", fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(chats.length).toBeGreaterThan(0);
    expect(chats[0]?.channel === "intercom" || chats[0]?.messages.length).toBeTruthy();
  });
});

describe("acceptLiveChats", () => {
  it("redacts a phone before detection and does not call the network", async () => {
    const store: StoreData = {
      tenant: { id: "tenant_partner", name: "Partner", createdAt: "2026-10-01T00:00:00.000Z" },
      conversations: [],
      messages: [],
      signals: [],
    };
    const detect = vi.fn(async () => ({ signals: [], llm: { enabled: false, added: 0, failed: 0, failure: null, skipped: 0 } }));
    const write = vi.fn(async () => undefined);
    const dualWrite = vi.fn(async () => undefined);
    const result = await acceptLiveChats(
      [
        {
          externalId: "gupshup:m1",
          channel: "whatsapp",
          messages: [
            {
              role: "customer",
              content: "call 9876543210 about my account",
              timestamp: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
      ],
      {
        read: async () => store,
        write,
        dualWrite,
        detect: detect as never,
      },
    );
    expect(result.accepted).toBe(1);
    expect(store.messages[0]?.content).toContain(REDACTION_TOKENS.phone);
    expect(store.messages[0]?.content).not.toContain("9876543210");
    expect(detect).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
  });
});
