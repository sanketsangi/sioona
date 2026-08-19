import { afterEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import {
  emptyTenantWipeStats,
  wipeTenantDataFailSoft,
} from "./wipe-tenant";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("emptyTenantWipeStats", () => {
  it("returns zero counts with ok:false so Reset Demo can still reseed", () => {
    expect(emptyTenantWipeStats("Signal Score backend unreachable")).toEqual({
      conversations: 0,
      messages: 0,
      predictions: 0,
      feedback: 0,
      pilot_settings: 0,
      ok: false,
      error: "Signal Score backend unreachable",
    });
  });
});

describe("wipeTenantDataFailSoft", () => {
  it("copies FastAPI counts and marks ok when wipe succeeds", async () => {
    const counts = {
      conversations: 3,
      messages: 10,
      predictions: 5,
      feedback: 2,
      pilot_settings: 1,
    };
    vi.spyOn(backendClient, "wipeTenantData").mockResolvedValue(counts);

    await expect(wipeTenantDataFailSoft("tenant_demo")).resolves.toEqual({
      ...counts,
      ok: true,
    });
    expect(backendClient.wipeTenantData).toHaveBeenCalledWith("tenant_demo");
  });

  it("never throws when FastAPI is down — reports zero counts + error", async () => {
    vi.spyOn(backendClient, "wipeTenantData").mockRejectedValue(
      new Error("Signal Score backend unreachable")
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(wipeTenantDataFailSoft("tenant_demo")).resolves.toEqual({
      conversations: 0,
      messages: 0,
      predictions: 0,
      feedback: 0,
      pilot_settings: 0,
      ok: false,
      error: "Signal Score backend unreachable",
    });
    expect(warn).toHaveBeenCalled();
  });

  it("maps non-Error throws to a reachable-backend message", async () => {
    vi.spyOn(backendClient, "wipeTenantData").mockRejectedValue("down");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await wipeTenantDataFailSoft("tenant_x");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Signal Score backend unreachable");
    expect(result.conversations).toBe(0);
  });
});
