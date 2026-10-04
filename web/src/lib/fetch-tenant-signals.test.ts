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
        json: async () => ({ predictions: [
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
        ], next_cursor: null }),
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

  it("requests only the active keep-set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ predictions: [], next_cursor: null }),
      })
    );

    const result = await fetchTenantSignals("tenant_demo", {
      conversationIds: ["conv_keep"],
    });
    expect(result).toEqual({ ok: true, rows: [] });
    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toContain("/v1/tenants/tenant_demo/signals/page?");
    expect(url).toContain("conversation_id=conv_keep");
    expect(url).not.toContain("needs-review");
    expect(url).not.toContain("other_pack");
  });

  it("returns no rows for an explicit empty keep-set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTenantSignals("tenant_demo", {
      conversationIds: [],
    });
    expect(result).toEqual({ ok: true, rows: [] });
    expect(fetchMock).not.toHaveBeenCalled();
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

it("follows cursors while preserving the active conversation scope", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ predictions: [{ id: "one" }], next_cursor: "next" }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ predictions: [{ id: "two" }], next_cursor: null }) });
  vi.stubGlobal("fetch", fetchMock);
  const result = await fetchTenantSignals("a", { conversationIds: ["keep"] });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.rows.map((row) => row.id)).toEqual(["one", "two"]);
  expect(String(fetchMock.mock.calls[1][0])).toContain("after=next");
  expect(fetchMock.mock.calls.every((call) => String(call[0]).includes("conversation_id=keep"))).toBe(true);
});
it("does not report success for a repeated cursor", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200,
    json: async () => ({ predictions: [], next_cursor: "same" }) }));
  expect((await fetchTenantSignals("a")).ok).toBe(false);
});

it("splits large conversation scopes into bounded requests", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200,
    json: async () => ({ predictions: [], next_cursor: null }) });
  vi.stubGlobal("fetch", fetchMock);
  const ids = Array.from({ length: 121 }, (_, i) => `c${i}`);
  expect((await fetchTenantSignals("a", { conversationIds: ids })).ok).toBe(true);
  expect(fetchMock.mock.calls.map((call) => new URL(String(call[0])).searchParams.getAll("conversation_id").length)).toEqual([50, 50, 21]);
});
