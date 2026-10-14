import { afterEach, expect, it, vi } from "vitest";
import { acceptLiveChats } from "./accept";
import { emptyStoreForTenant } from "../store";
import { transcriptContentHash } from "../sync-detection-run";
import type { Conversation, Message } from "../types";

afterEach(() => vi.unstubAllEnvs());

it("publishes an added Intercom reply under the stable ID and skips its exact replay after restart", async () => {
  vi.stubEnv("SIOONA_STATE_MODE", "postgres");
  let currentHash: string | null = null;
  const stableIds: string[] = [];
  const publishedIds = vi.fn(async (_tenant: string, ids: string[]) => currentHash ? ids : []);
  const revisions = vi.fn(async (_tenant: string, ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, currentHash])));
  const publish = vi.fn(async (input: { conversations: Conversation[]; messages: Message[];
    expectedContentHashes?: Record<string, string | null> }) => {
    expect(input.expectedContentHashes).toEqual({ [input.conversations[0].id]: currentHash });
    stableIds.push(input.conversations[0].id);
    currentHash = transcriptContentHash(input.messages);
    return { uploadId: "synthetic", signals: [] };
  });
  const detect = vi.fn(async () => ({ signals: [], llm: { failed: 0, skipped: 0 } }));
  const inputs = [{ externalId: "intercom-1", channel: "intercom",
    messages: [{ role: "customer" as const, content: "Synthetic first turn", timestamp: "2026-10-01T00:00:00Z" }] }];
  // Each read is a cold process with no runtime conversation cache.
  const deps = { read: async () => emptyStoreForTenant("tenant_partner"),
    write: vi.fn(), detect, publish, publishedIds, revisions };
  expect((await acceptLiveChats(inputs, deps as never)).accepted).toBe(1);
  inputs[0].messages.push({ role: "customer", content: "Synthetic added reply", timestamp: "2026-10-01T00:01:00Z" });
  expect((await acceptLiveChats(inputs, deps as never)).accepted).toBe(1);
  expect(stableIds[1]).toBe(stableIds[0]);
  expect(publish.mock.calls[1][0].messages).toHaveLength(2);
  expect((await acceptLiveChats(inputs, deps as never)).accepted).toBe(0);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(detect).toHaveBeenCalledTimes(2);
});
