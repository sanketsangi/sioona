import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTenantSignals } from "./fetch-tenant-signals";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchTenantSignals", () => {
  it("returns predictions with feedback when backend is up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "pred-done",
            tenant_id: "tenant_demo",
            conversation_id: "conv_zrdh_1",
            signal_type: "lead",
            confidence: 0.8,
            summary: "Intent",
            created_at: "2026-08-01T00:00:00.000Z",
            acted: false,
            feedback: {
              id: "fb-1",
              tenant_id: "tenant_demo",
              signal_id: "pred-done",
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
      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].id).toBe("pred-done");
      expect(result.predictions[0].feedback?.feedback).toBe("correct");
    }
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/v1/tenants/tenant_demo/signals"),
      expect.anything()
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      expect.stringContaining("needs-review"),
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
