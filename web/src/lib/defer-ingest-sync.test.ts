import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistDeferredIngestDualWrite } from "./defer-ingest-sync";
import type { Conversation, Message, Signal, StoreData } from "./types";

vi.mock("./store", () => ({
  readStore: vi.fn(),
  writeStore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./sync-predictions", () => ({
  syncPredictionsToBackend: vi.fn(),
}));

vi.mock("./sync-conversations", () => ({
  syncConversationsToBackend: vi.fn(),
  pruneConversationsNotInBackend: vi.fn(),
}));

import { readStore, writeStore } from "./store";
import { syncPredictionsToBackend } from "./sync-predictions";
import {
  pruneConversationsNotInBackend,
  syncConversationsToBackend,
} from "./sync-conversations";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "lead",
    score: 0.9,
    confidence: 0.9,
    summary: "Buying intent",
    suggestedAction: "Follow up",
    evidence: ["quote"],
    status: "new",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv_1",
    tenantId: "tenant_demo",
    channel: "whatsapp",
    startedAt: "2026-08-01T00:00:00.000Z",
    messageIds: ["msg_1"],
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    conversationId: "conv_1",
    role: "customer",
    content: "I want to open a demat account",
    timestamp: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function store(signals: Signal[]): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [conversation()],
    messages: [message()],
    signals,
    pilot: { baselineOpportunities: 0 },
  };
}

const input = {
  tenantId: "tenant_demo",
  conversations: [conversation()],
  messages: [message()],
  signals: [signal()],
  replaceShowcase: true,
};

describe("persistDeferredIngestDualWrite", () => {
  beforeEach(() => {
    vi.mocked(readStore).mockReset();
    vi.mocked(writeStore).mockReset().mockResolvedValue(undefined);
    vi.mocked(syncPredictionsToBackend).mockReset();
    vi.mocked(syncConversationsToBackend).mockReset().mockResolvedValue({
      attempted: 1,
      created: 1,
      updated: 0,
      failed: 0,
      skipped: 0,
      messagesCreated: 1,
      messagesUpdated: 0,
    });
    vi.mocked(pruneConversationsNotInBackend).mockReset().mockResolvedValue({
      deleted: 0,
      kept: 1,
      skipped: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dual-writes chats + predictions then heals backendSignalId", async () => {
    vi.mocked(readStore).mockResolvedValue(store([signal()]));
    vi.mocked(syncPredictionsToBackend).mockResolvedValue({
      signals: [signal({ backendSignalId: "pred-1" })],
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });

    await persistDeferredIngestDualWrite(input);

    expect(syncConversationsToBackend).toHaveBeenCalledWith(
      input.conversations,
      input.messages,
      "tenant_demo",
      { clearUnlabeledGroundTruth: true }
    );
    expect(syncPredictionsToBackend).toHaveBeenCalledWith(
      input.signals,
      "tenant_demo"
    );
    expect(writeStore).toHaveBeenCalledWith(
      expect.objectContaining({
        signals: [expect.objectContaining({ backendSignalId: "pred-1" })],
      })
    );
    expect(pruneConversationsNotInBackend).toHaveBeenCalledWith(
      "tenant_demo",
      ["conv_1"]
    );
  });

  it("skips prune on mid-week merge", async () => {
    vi.mocked(readStore).mockResolvedValue(store([signal()]));
    vi.mocked(syncPredictionsToBackend).mockResolvedValue({
      signals: [signal({ backendSignalId: "pred-1" })],
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });

    await persistDeferredIngestDualWrite({
      ...input,
      replaceShowcase: false,
    });

    expect(syncConversationsToBackend).toHaveBeenCalledWith(
      input.conversations,
      input.messages,
      "tenant_demo",
      { clearUnlabeledGroundTruth: false }
    );
    expect(pruneConversationsNotInBackend).not.toHaveBeenCalled();
  });

  it("does not rewrite JSON when Neon ids did not change", async () => {
    const already = [signal({ backendSignalId: "pred-1" })];
    vi.mocked(readStore).mockResolvedValue(store(already));
    vi.mocked(syncPredictionsToBackend).mockResolvedValue({
      signals: already,
      sync: {
        attempted: 1,
        created: 0,
        updated: 1,
        failed: 0,
        skipped: 0,
      },
    });

    await persistDeferredIngestDualWrite({
      ...input,
      signals: already,
    });

    expect(writeStore).not.toHaveBeenCalled();
  });
});
