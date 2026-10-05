import { expect, it, vi } from "vitest";
import { finalizePublishedUpload } from "./finalize-published-upload";
it("reports both secondary failures without changing publication success", async () => {
  const cache = vi.fn().mockRejectedValue(new Error("disk full"));
  const pilot = vi.fn().mockRejectedValue(new Error("settings unavailable"));
  const warnings = await finalizePublishedUpload({ cache, pilot });
  expect(warnings).toHaveLength(2);
  expect(warnings.every((warning) => warning.startsWith("Upload stored."))).toBe(true);
  expect(cache).toHaveBeenCalledOnce();
  expect(pilot).toHaveBeenCalledOnce();
});
it("returns no warning when cache and settings complete", async () => {
  expect(await finalizePublishedUpload({ cache: async () => {}, pilot: async () => {} })).toEqual([]);
});
