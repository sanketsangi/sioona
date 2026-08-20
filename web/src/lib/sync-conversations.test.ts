import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendClientError } from "./backend-client";
import {
  CONVERSATION_SYNC_BACKOFF_MS,
  CONVERSATION_SYNC_MAX_ATTEMPTS,
  pruneConversationsNotInBackend,
  syncConversationsToBackend,
  toConversationSyncPayload,
} from "./sync-conversations";
import type { Conversation, Message } from "./types";

const conversation: Conversation = {
  id: "conv_1",
  tenantId: "tenant_demo",
  externalId: "priya_1",
  channel: "whatsapp",
  customerName: "Priya",
  startedAt: "2026-08-01T10:00:00.000Z",
  messageIds: ["msg_conv_1_0"],
};

const message: Message = {
  id: "msg_conv_1_0",
  conversationId: "conv_1",
  role: "customer",
  content: "I want to close my account",
  timestamp: "2026-08-01T10:00:00.000Z",
};

const createdBody = {
  conversations: [
    {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      tenant_id: "tenant_demo",
      conversation_id: "conv_1",
      channel: "whatsapp",
      customer_name: "Priya",
      started_at: "2026-08-01T10:00:00.000Z",
      external_id: "priya_1",
      created_at: "2026-08-01T10:00:00.000Z",
      updated_at: "2026-08-01T10:00:00.000Z",
      messages: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          tenant_id: "tenant_demo",
          conversation_id: "conv_1",
          message_id: "msg_conv_1_0",
          role: "customer",
          content: "I want to close my account",
          timestamp: "2026-08-01T10:00:00.000Z",
          created_at: "2026-08-01T10:00:00.000Z",
        },
      ],
    },
  ],
  created: 1,
  updated: 0,
  messages_created: 1,
  messages_updated: 0,
};

function okResponse(body = createdBody) {
  return {
    ok: true,
    status: 201,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("toConversationSyncPayload", () => {
  it("maps labeled JSON groundTruth to ground_truth and omits unlabeled", () => {
    const labeled = toConversationSyncPayload(
      [{ ...conversation, groundTruth: "retention" }],
      [message]
    );
    expect(labeled).toEqual([
      {
        conversation_id: "conv_1",
        channel: "whatsapp",
        customer_name: "Priya",
        started_at: "2026-08-01T10:00:00.000Z",
        external_id: "priya_1",
        ground_truth: "retention",
        messages: [
          {
            message_id: "msg_conv_1_0",
            role: "customer",
            content: "I want to close my account",
            timestamp: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
    ]);
    expect(JSON.stringify(labeled)).not.toContain("groundTruth");

    const unlabeled = toConversationSyncPayload([conversation], [message]);
    expect(unlabeled[0]).not.toHaveProperty("ground_truth");
    expect(unlabeled[0]).not.toHaveProperty("clear_ground_truth");
  });

  it("sets clear_ground_truth on replace when the conversation is unlabeled", () => {
    const payload = toConversationSyncPayload([conversation], [message], {
      clearUnlabeledGroundTruth: true,
    });
    expect(payload[0]).not.toHaveProperty("ground_truth");
    expect(payload[0]?.clear_ground_truth).toBe(true);

    const labeled = toConversationSyncPayload(
      [{ ...conversation, groundTruth: "none" }],
      [message],
      { clearUnlabeledGroundTruth: true }
    );
    expect(labeled[0]?.ground_truth).toBe("none");
    expect(labeled[0]).not.toHaveProperty("clear_ground_truth");
  });
});

describe("syncConversationsToBackend", () => {
  it("bulk-upserts conversations and returns create counts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const sync = await syncConversationsToBackend(
      [conversation],
      [message],
      "tenant_demo"
    );

    expect(sync).toEqual({
      attempted: 1,
      created: 1,
      updated: 0,
      failed: 0,
      skipped: 0,
      messagesCreated: 1,
      messagesUpdated: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/conversations/bulk"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      conversations: unknown[];
    };
    expect(body.conversations).toHaveLength(1);
  });

  it("reports 0 then per-chunk counts", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          conversations: unknown[];
        };
        const n = body.conversations.length;
        return {
          ok: true,
          status: 201,
          json: async () => ({
            conversations: [],
            created: n,
            updated: 0,
            messages_created: n,
            messages_updated: 0,
          }),
        };
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = Array.from({ length: 6 }, (_, i) => ({
      conversation: {
        ...conversation,
        id: `conv_${i}`,
        messageIds: [`msg_${i}`],
      },
      message: {
        ...message,
        id: `msg_${i}`,
        conversationId: `conv_${i}`,
      },
    }));
    const ticks: Array<{ done: number; total: number }> = [];

    await syncConversationsToBackend(
      rows.map((row) => row.conversation),
      rows.map((row) => row.message),
      "tenant_demo",
      {
        onProgress: (done, total) => {
          ticks.push({ done, total });
        },
      }
    );

    expect(ticks).toEqual([
      { done: 0, total: 6 },
      { done: 5, total: 6 },
      { done: 6, total: 6 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("counts updates when Neon already has the rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        ...createdBody,
        created: 0,
        updated: 1,
        messages_created: 0,
        messages_updated: 1,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const sync = await syncConversationsToBackend(
      [conversation],
      [message],
      "tenant_demo"
    );

    expect(sync.created).toBe(0);
    expect(sync.updated).toBe(1);
    expect(sync.messagesUpdated).toBe(1);
    expect(sync.failed).toBe(0);
  });

  it("retries with backoff after one transient failure then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sync = await syncConversationsToBackend(
      [conversation],
      [message],
      "tenant_demo",
      { sleep }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(CONVERSATION_SYNC_BACKOFF_MS[0]);
    expect(sync.created).toBe(1);
    expect(sync.failed).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not throw after all retries — fail-soft counts failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sync = await syncConversationsToBackend(
      [conversation, { ...conversation, id: "conv_2" }],
      [message],
      "tenant_demo",
      { sleep }
    );

    expect(fetchMock).toHaveBeenCalledTimes(CONVERSATION_SYNC_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(CONVERSATION_SYNC_MAX_ATTEMPTS - 1);
    expect(sync).toEqual({
      attempted: 2,
      created: 0,
      updated: 0,
      failed: 2,
      skipped: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
    });
    expect(warn).toHaveBeenCalled();
  });

  it("skips the network when there are no conversations", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sync = await syncConversationsToBackend([], [], "tenant_demo");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sync.attempted).toBe(0);
    expect(sync.failed).toBe(0);
  });
});

describe("pruneConversationsNotInBackend", () => {
  it("returns deleted/kept when prune succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted: 41, kept: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const stats = await pruneConversationsNotInBackend("tenant_demo", [
      "conv_keep",
    ]);

    expect(stats).toEqual({ deleted: 41, kept: 1, skipped: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/tenants/tenant_demo/conversations/prune"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("fail-softs on 404 old API without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ detail: "Not Found" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const stats = await pruneConversationsNotInBackend("tenant_demo", [
      "conv_keep",
    ]);

    expect(stats).toEqual({
      deleted: 0,
      kept: 1,
      skipped: true,
      reason: "not_supported",
    });
    expect(warn).toHaveBeenCalled();
  });

  it("fail-softs on network errors without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new BackendClientError("ECONNREFUSED"))
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const stats = await pruneConversationsNotInBackend("tenant_demo", [
      "conv_keep",
    ]);

    expect(stats.skipped).toBe(true);
    expect(stats.reason).toBe("backend_unavailable");
    expect(warn).toHaveBeenCalled();
  });
});
