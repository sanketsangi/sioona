import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTenantSignals } from "./fetch-tenant-signals";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchTenantSignals", () => {
  it("returns rows when backend is up", async () => {
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
            acted: false,
            created_at: "2026-08-01T00:00:00.000Z",
            feedback: {
              id: "fb-1",
              tenant_id: "tenant_demo",
              signal_id: "pred-1",
              feedback: "correct",
              note: null,
              reviewed_by: "shadow_reviewer",
              reviewed_at: "2026-08-02T00:00:00.000Z",
            },
          },
        ],
      })
    );

    const result = await fetchTenantSignals("tenant_demo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe("pred-1");
      expect(result.rows[0].feedback?.feedback).toBe("correct");
    }
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/v1/tenants/tenant_demo/signals"),
      expect.anything()
    );
  });

  it("returns explicit error when backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const result = await fetchTenantSignals("tenant_demo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unreachable|ECONNREFUSED/i);
    }
  });
});
