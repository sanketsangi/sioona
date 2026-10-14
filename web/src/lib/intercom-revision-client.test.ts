import { afterEach, expect, it, vi } from "vitest";
import { getPublishedConversationRevisions } from "./backend-client";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("requests bounded tenant-scoped hashes and accepts an absent conversation", async () => {
  vi.stubEnv("SIOONA_ACTOR_AUTH", "off");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SIOONA_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "preview");
  const fetch = vi.fn().mockResolvedValue(Response.json({ content_hashes: { c1: "a".repeat(64), c2: null } }));
  vi.stubGlobal("fetch", fetch);
  expect(await getPublishedConversationRevisions("tenant_a", ["c1", "c2"])).toEqual({ c1: "a".repeat(64), c2: null });
  const [url, init] = fetch.mock.calls[0];
  expect(String(url)).toContain("/tenants/tenant_a/uploads/published-conversations");
  expect(JSON.parse(init.body)).toEqual({ conversation_ids: ["c1", "c2"], include_content_hashes: true });
});

it.each([{}, { c2: null }, { c1: "bad" }, { c1: null, extra: null }])("fails closed on incomplete/invalid revision lookup %j", async (content_hashes) => {
  vi.stubEnv("SIOONA_ACTOR_AUTH", "off");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ content_hashes })));
  await expect(getPublishedConversationRevisions("tenant_a", ["c1"])).rejects.toThrow("Invalid conversation revision lookup");
});
