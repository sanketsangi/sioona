import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./concurrency";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("mapWithConcurrency", () => {
  it("returns [] for no items without calling the mapper", async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 3, async () => {
      calls += 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("preserves input order regardless of completion order", async () => {
    const out = await mapWithConcurrency([30, 1, 15, 2], 4, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual([30, 1, 15, 2]);
  });

  it("passes the item index", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 2, async (item, i) => {
      return `${i}:${item}`;
    });
    expect(out).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }), 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
    });
    expect(peak).toBe(3);
  });

  it.each([0, -5, Number.NaN])(
    "falls back to one worker for concurrency %s",
    async (concurrency) => {
      let active = 0;
      let peak = 0;
      const out = await mapWithConcurrency([1, 2, 3], concurrency, async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        await tick();
        active -= 1;
        return n * 2;
      });
      expect(out).toEqual([2, 4, 6]);
      expect(peak).toBe(1);
    },
  );

  it("rejects when a mapper rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
