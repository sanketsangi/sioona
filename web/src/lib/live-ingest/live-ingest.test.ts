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
      expect(init?.signal).toBeInstanceOf(AbortSignal);
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
    const write = vi.fn(async (_store: StoreData) => undefined);
    const publish = vi.fn(async () => ({ uploadId: "live-upload", signals: [] }));
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
        publish,
        publishedIds: async () => [],
        detect: detect as never,
      },
    );
    expect(result.accepted).toBe(1);
    expect(write.mock.calls[0][0].messages[0]?.content).toContain(REDACTION_TOKENS.phone);
    expect(write.mock.calls[0][0].messages[0]?.content).not.toContain("9876543210");
    expect(detect).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(dualWrite).not.toHaveBeenCalled();
    expect(store.messages).toEqual([]);
    expect(publish.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]);
  });
});

it("keeps a failed live publication out of the cache so the webhook can retry", async () => {
  const store = { tenant: { id: "tenant_partner" }, conversations: [], messages: [], signals: [] } as unknown as StoreData;
  const write = vi.fn();
  const publish = vi.fn().mockRejectedValue(new Error("publication unavailable"));
  const detect = vi.fn().mockResolvedValue({ signals: [], llm: { failed: 0, skipped: 0 } });
  await expect(acceptLiveChats([{ externalId: "gupshup:retry", channel: "whatsapp",
    messages: [{ role: "customer", content: "Hello", timestamp: "2026-10-01T00:00:00Z" }] }],
    { read: async () => store, write, publish, detect, publishedIds: async () => [] })).rejects.toThrow("publication unavailable");
  expect(write).not.toHaveBeenCalled();
  expect(store.conversations).toEqual([]);
  expect(store.messages).toEqual([]);
});
it("skips durably published live events with an empty local cache", async () => {
  const store = { tenant: { id: "tenant_partner" }, conversations: [], messages: [], signals: [] } as unknown as StoreData;
  const detect = vi.fn();
  const write = vi.fn();
  const publish = vi.fn();
  const result = await acceptLiveChats([{ externalId: "gupshup:seen", channel: "whatsapp",
    messages: [{ role: "customer", content: "Hello", timestamp: "2026-10-01T00:00:00Z" }] }],
    { read: async () => store, write, publish, detect, publishedIds: async (_tenant, ids) => ids });
  expect(result.accepted).toBe(0);
  expect(detect).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it("does not classify or publish when durable deduplication is unavailable", async () => {
  const store = { tenant: { id: "tenant_partner" }, conversations: [], messages: [], signals: [] } as unknown as StoreData;
  const detect = vi.fn(), write = vi.fn(), publish = vi.fn();
  await expect(acceptLiveChats([{ externalId: "gupshup:lookup-failure", channel: "whatsapp",
    messages: [{ role: "customer", content: "Hello", timestamp: "2026-10-01T00:00:00Z" }] }],
    { read: async () => store, write, publish, detect,
      publishedIds: async () => { throw new Error("lookup unavailable"); } })).rejects.toThrow("lookup unavailable");
  expect(detect).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

describe("Postgres live ingest flow", () => {
  it("uses readLiveIngestStore and avoids requesting /uploads, conversations, signals, or supervised-actions", async () => {
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    vi.stubEnv("SIOONA_TENANT_ID", "tenant_partner");
    const requestedPaths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedPaths.push(url);
      if (url.includes("/uploads") && (init?.method ?? "GET") === "GET") {
        return new Response("Forbidden", { status: 403 });
      }
      if (url.includes("/pilot")) {
        return Response.json({ tenant_id: "tenant_partner", weekly_export_count: 2, last_uploaded_file_name: "file.csv" });
      }
      if (url.includes("/detection-resume")) {
        return Response.json({ tenant_id: "tenant_partner", failed_conversation_ids: [], skipped_conversation_ids: [], updated_at: "2026-10-01T00:00:00Z" });
      }
      if (url.includes("/taxonomy-overrides")) {
        return Response.json({ lead: { phrases: ["want demo"], keywords: [], negative_phrases: [] } });
      }
      if (url.includes("/published-conversations")) {
        return Response.json({ conversation_ids: [] });
      }
      if (url.includes("/ingestions/")) {
        return Response.json({ upload_id: "u1", status: "completed", active: true, predictions: [] });
      }
      return Response.json({});
    }));

    const result = await acceptLiveChats(
      [{
        externalId: "ext:1",
        channel: "whatsapp",
        messages: [{ role: "customer", content: "hello world", timestamp: "2026-10-01T00:00:00Z" }],
      }],
      {
        detect: vi.fn().mockResolvedValue({ signals: [], llm: { enabled: false, failed: 0, skipped: 0 } }) as never,
      },
    );

    expect(result.accepted).toBe(1);
    expect(requestedPaths.some((p) => p.endsWith("/uploads"))).toBe(false);
    expect(requestedPaths.some((p) => p.includes("/conversations") && !p.includes("/published-conversations"))).toBe(false);
    expect(requestedPaths.some((p) => p.includes("/signals"))).toBe(false);
    expect(requestedPaths.some((p) => p.includes("/supervised-actions"))).toBe(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

