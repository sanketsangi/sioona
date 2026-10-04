import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ getConversations: vi.fn() }));
import { getConversations } from "./backend-client";
import { fetchScopedConversations } from "./fetch-scoped-conversations";
beforeEach(() => { vi.mocked(getConversations).mockReset().mockResolvedValue([]); });
it("bounds every request and preserves deduplicated membership", async () => {
  const ids = Array.from({ length: 121 }, (_, index) => `conv_${index}`);
  await fetchScopedConversations("a", [...ids, ids[0], ""], { timeoutMs: 5000 });
  const calls = vi.mocked(getConversations).mock.calls;
  expect(calls.map((call) => call[1]?.conversationIds?.length)).toEqual([50, 50, 21]);
  expect(calls.flatMap((call) => call[1]?.conversationIds ?? [])).toEqual(ids);
  expect(calls.every((call) => call[0] === "a" && call[1]?.timeoutMs === 5000)).toBe(true);
});
it("empty membership never becomes an unfiltered request", async () => {
  expect(await fetchScopedConversations("a", [])).toEqual([]);
  expect(getConversations).not.toHaveBeenCalled();
});
it("later batch failure rejects the whole hydration", async () => {
  vi.mocked(getConversations).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("unavailable"));
  await expect(fetchScopedConversations("a", Array.from({ length: 51 }, (_, i) => String(i)))).rejects.toThrow("unavailable");
});
