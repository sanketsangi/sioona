import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { BackendClientError } from "./backend-client";
import { syncPilotSettingsToBackend } from "./sync-pilot";
import { readStore, resetStore, setPilotBaseline, writeStore } from "./store";

describe("syncPilotSettingsToBackend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the backend row on success", async () => {
    vi.spyOn(backendClient, "putPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "note",
      weekly_export_count: 1,
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    });

    const result = await syncPilotSettingsToBackend("tenant_demo", {
      baselineOpportunities: 12,
      baselineNote: "note",
      weeklyExportCount: 1,
    });

    expect(result?.weekly_export_count).toBe(1);
    expect(backendClient.putPilotSettings).toHaveBeenCalledWith("tenant_demo", {
      baseline_opportunities: 12,
      baseline_note: "note",
      weekly_export_count: 1,
    });
  });

  it("fail-softs and returns null when PUT fails", async () => {
    vi.spyOn(backendClient, "putPilotSettings").mockRejectedValue(
      new BackendClientError("down", 500)
    );

    await expect(
      syncPilotSettingsToBackend("tenant_demo", {
        baselineOpportunities: 0,
        weeklyExportCount: 1,
      })
    ).resolves.toBeNull();
  });
});

describe("setPilotBaseline", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves weeklyExportCount and attempts Neon dual-write", async () => {
    const store = await readStore();
    store.pilot = {
      baselineOpportunities: 0,
      weeklyExportCount: 2,
    };
    await writeStore(store);

    const putSpy = vi.spyOn(backendClient, "putPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "eval baseline",
      weekly_export_count: 2,
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    });

    const after = await setPilotBaseline(12, "eval baseline");

    expect(after.pilot?.baselineOpportunities).toBe(12);
    expect(after.pilot?.baselineNote).toBe("eval baseline");
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(putSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        baseline_opportunities: 12,
        baseline_note: "eval baseline",
        weekly_export_count: 2,
      })
    );
  });

  it("still saves JSON baseline when Neon PUT fails", async () => {
    vi.spyOn(backendClient, "putPilotSettings").mockRejectedValue(
      new BackendClientError("down", 500)
    );

    const after = await setPilotBaseline(8, "local only");
    expect(after.pilot?.baselineOpportunities).toBe(8);
    expect(after.pilot?.baselineNote).toBe("local only");
  });
});
