import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNeedsReview } from "./fetch-needs-review";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchNeedsReview", () => {
  it("returns predictions when backend is up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "pred-1",
            tenant_id: "tenant_demo",
            conversation_id: "conv_1",
            signal_type: "lead",
            confidence: 0.8,
            summary: "Intent",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      })
    );

    const result = await fetchNeedsReview("tenant_demo", 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].id).toBe("pred-1");
    }
  });

  it("returns explicit error when backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const result = await fetchNeedsReview("tenant_demo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unreachable|ECONNREFUSED/i);
    }
  });
});
