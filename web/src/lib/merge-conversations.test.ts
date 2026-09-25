import { describe, expect, it } from "vitest";
import {
  appendConversationsAsDistinctFile,
  mergeConversationsByExternalId,
} from "./merge-conversations";
import type { Conversation, Message } from "./types";

function conversation(
  overrides: Partial<Conversation> & Pick<Conversation, "id">
): Conversation {
  return {
    tenantId: "tenant_demo",
    channel: "whatsapp",
    startedAt: "2026-08-01T00:00:00.000Z",
    messageIds: [],
    ...overrides,
  };
}

function message(
  overrides: Partial<Message> & Pick<Message, "id" | "conversationId">
): Message {
  return {
    role: "customer",
    content: "hello",
    timestamp: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergeConversationsByExternalId", () => {
  it("replaces messages for the same externalId without duplicating", () => {
    const existingConv = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      customerName: "Asha",
      messageIds: ["msg_conv_wa_reupload_1_0"],
    });
    const incomingConv = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      customerName: "Asha",
      startedAt: "2026-08-08T00:00:00.000Z",
      messageIds: ["msg_conv_wa_reupload_1_0", "msg_conv_wa_reupload_1_1"],
    });

    const merged = mergeConversationsByExternalId(
      {
        conversations: [existingConv],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: existingConv.id,
            content: "old",
          }),
        ],
      },
      {
        conversations: [incomingConv],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: incomingConv.id,
            content: "updated first",
          }),
          message({
            id: "msg_conv_wa_reupload_1_1",
            conversationId: incomingConv.id,
            role: "agent",
            content: "new reply",
          }),
        ],
      }
    );

    expect(merged.conversations).toHaveLength(1);
    expect(merged.conversations[0].id).toBe("conv_wa_reupload_1");
    expect(merged.replacedIds).toEqual(["conv_wa_reupload_1"]);
    expect(merged.addedIds).toEqual([]);
    expect(merged.messages.map((row) => row.content)).toEqual([
      "updated first",
      "new reply",
    ]);
    expect(merged.conversations[0].messageIds).toEqual([
      "msg_conv_wa_reupload_1_0",
      "msg_conv_wa_reupload_1_1",
    ]);
  });

  it("matches a random existing id via externalId and keeps that id", () => {
    const existingConv = conversation({
      id: "conv_a1b2c3d4",
      externalId: "wa-1",
      customerName: "Asha",
      messageIds: ["msg_conv_a1b2c3d4_0"],
    });
    const incomingConv = conversation({
      id: "conv_wa_1",
      externalId: "wa-1",
      customerName: "Asha Mehta",
      messageIds: ["msg_conv_wa_1_0"],
    });

    const merged = mergeConversationsByExternalId(
      {
        conversations: [existingConv],
        messages: [
          message({
            id: "msg_conv_a1b2c3d4_0",
            conversationId: existingConv.id,
            content: "old",
          }),
        ],
      },
      {
        conversations: [incomingConv],
        messages: [
          message({
            id: "msg_conv_wa_1_0",
            conversationId: incomingConv.id,
            content: "new",
          }),
        ],
      }
    );

    expect(merged.conversations).toHaveLength(1);
    expect(merged.conversations[0].id).toBe("conv_a1b2c3d4");
    expect(merged.conversations[0].customerName).toBe("Asha Mehta");
    expect(merged.replacedIds).toEqual(["conv_a1b2c3d4"]);
    expect(merged.messages).toEqual([
      expect.objectContaining({
        id: "msg_conv_a1b2c3d4_0",
        conversationId: "conv_a1b2c3d4",
        content: "new",
      }),
    ]);
  });

  it("falls back to stableConversationId when existing has no externalId", () => {
    const existingConv = conversation({
      id: "conv_priya_sharma_22",
      customerName: "Priya",
      messageIds: ["msg_conv_priya_sharma_22_0"],
    });
    const incomingConv = conversation({
      id: "conv_priya_sharma_22",
      externalId: "priya_sharma_22",
      customerName: "Priya Sharma",
      messageIds: ["msg_conv_priya_sharma_22_0"],
    });

    const merged = mergeConversationsByExternalId(
      {
        conversations: [existingConv],
        messages: [
          message({
            id: "msg_conv_priya_sharma_22_0",
            conversationId: existingConv.id,
            content: "old",
          }),
        ],
      },
      {
        conversations: [incomingConv],
        messages: [
          message({
            id: "msg_conv_priya_sharma_22_0",
            conversationId: incomingConv.id,
            content: "updated",
          }),
        ],
      }
    );

    expect(merged.conversations).toHaveLength(1);
    expect(merged.conversations[0].id).toBe("conv_priya_sharma_22");
    expect(merged.conversations[0].externalId).toBe("priya_sharma_22");
    expect(merged.replacedIds).toEqual(["conv_priya_sharma_22"]);
    expect(merged.messages[0].content).toBe("updated");
  });

  it("appends a new externalId and leaves other chats untouched", () => {
    const kept = conversation({
      id: "conv_showcase",
      externalId: "showcase_1",
      customerName: "Kept",
      messageIds: ["msg_conv_showcase_0"],
    });
    const incomingConv = conversation({
      id: "conv_wa_new",
      externalId: "wa-new",
      customerName: "New",
      messageIds: ["msg_conv_wa_new_0"],
    });

    const merged = mergeConversationsByExternalId(
      {
        conversations: [kept],
        messages: [
          message({
            id: "msg_conv_showcase_0",
            conversationId: kept.id,
            content: "showcase",
          }),
        ],
      },
      {
        conversations: [incomingConv],
        messages: [
          message({
            id: "msg_conv_wa_new_0",
            conversationId: incomingConv.id,
            content: "fresh",
          }),
        ],
      }
    );

    expect(merged.conversations.map((row) => row.id)).toEqual([
      "conv_showcase",
      "conv_wa_new",
    ]);
    expect(merged.addedIds).toEqual(["conv_wa_new"]);
    expect(merged.replacedIds).toEqual([]);
    expect(merged.messages.map((row) => row.content)).toEqual([
      "showcase",
      "fresh",
    ]);
  });

  it("applies incoming groundTruth and keeps prior when incoming has none", () => {
    const existingLabeled = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      groundTruth: "retention",
      messageIds: ["msg_conv_wa_reupload_1_0"],
    });
    const incomingUnlabeled = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      messageIds: ["msg_conv_wa_reupload_1_0"],
    });
    const kept = mergeConversationsByExternalId(
      {
        conversations: [existingLabeled],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: existingLabeled.id,
          }),
        ],
      },
      {
        conversations: [incomingUnlabeled],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: incomingUnlabeled.id,
            content: "updated",
          }),
        ],
      }
    );
    expect(kept.conversations[0].groundTruth).toBe("retention");

    const incomingLabeled = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      groundTruth: "lead",
      messageIds: ["msg_conv_wa_reupload_1_0"],
    });
    const applied = mergeConversationsByExternalId(
      {
        conversations: [existingLabeled],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: existingLabeled.id,
          }),
        ],
      },
      {
        conversations: [incomingLabeled],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: incomingLabeled.id,
            content: "updated",
          }),
        ],
      }
    );
    expect(applied.conversations[0].groundTruth).toBe("lead");
  });

  it("keeps the incoming sourceFile on a matched conversation", () => {
    const existing = conversation({
      id: "conv_a",
      externalId: "ext-a",
      sourceFile: "old.csv",
    });
    const incoming = conversation({
      id: "conv_other",
      externalId: "ext-a",
      sourceFile: "new.csv",
    });
    const result = mergeConversationsByExternalId(
      { conversations: [existing], messages: [] },
      { conversations: [incoming], messages: [] },
    );
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe("conv_a");
    expect(result.conversations[0].sourceFile).toBe("new.csv");
  });
});

describe("appendConversationsAsDistinctFile", () => {
  it("keeps the earlier file when externalId and conversation id collide", () => {
    const existing = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      sourceFile: "batch_095.json",
      customerName: "Asha",
      messageIds: ["msg_conv_wa_reupload_1_0"],
    });
    const incoming = conversation({
      id: "conv_wa_reupload_1",
      externalId: "wa-reupload-1",
      sourceFile: "batch_095 (2).json",
      customerName: "Neha",
    });
    const result = appendConversationsAsDistinctFile(
      {
        conversations: [existing],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: existing.id,
            content: "first file",
          }),
        ],
      },
      {
        conversations: [incoming],
        messages: [
          message({
            id: "msg_conv_wa_reupload_1_0",
            conversationId: incoming.id,
            content: "second file",
          }),
        ],
      },
    );

    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0].sourceFile).toBe("batch_095.json");
    expect(result.conversations[0].customerName).toBe("Asha");
    expect(result.conversations[1].sourceFile).toBe("batch_095 (2).json");
    expect(result.conversations[1].id).not.toBe(existing.id);
    expect(result.messages.map((row) => row.content).sort()).toEqual([
      "first file",
      "second file",
    ]);
    expect(new Set(result.conversations.map((row) => row.id)).size).toBe(2);
    expect(new Set(result.messages.map((row) => row.id)).size).toBe(2);
  });
});
