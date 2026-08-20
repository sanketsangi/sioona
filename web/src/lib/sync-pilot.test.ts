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
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue(null);
    vi.spyOn(backendClient, "putPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "note",
      weekly_export_count: 1,
      last_uploaded_file_name: null,
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
      last_uploaded_file_name: null,
    });
  });

  it("fail-softs and returns null when PUT fails", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue(null);
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

  it("merges weeklyExportCount and filename from Neon when local pilot omits them", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: "Groww_batch_02",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    });
    const putSpy = vi.spyOn(backendClient, "putPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: "Groww_batch_02",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    });

    await syncPilotSettingsToBackend("tenant_demo", {
      baselineOpportunities: 4,
      lastUploadedFileName: "Groww_batch_02",
    });

    expect(putSpy).toHaveBeenCalledWith("tenant_demo", {
      baseline_opportunities: 4,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: "Groww_batch_02",
    });
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
      lastUploadedFileName: "groww_batch_02.csv",
    };
    await writeStore(store);

    const putSpy = vi.spyOn(backendClient, "putPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "eval baseline",
      weekly_export_count: 2,
      last_uploaded_file_name: "groww_batch_02.csv",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    });
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue(null);

    const after = await setPilotBaseline(12, "eval baseline");

    expect(after.pilot?.baselineOpportunities).toBe(12);
    expect(after.pilot?.baselineNote).toBe("eval baseline");
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.pilot?.lastUploadedFileName).toBe("groww_batch_02.csv");
    expect(putSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        baseline_opportunities: 12,
        baseline_note: "eval baseline",
        weekly_export_count: 2,
        last_uploaded_file_name: "groww_batch_02.csv",
      })
    );
  });

  it("still saves JSON baseline when Neon PUT fails", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue(null);
    vi.spyOn(backendClient, "putPilotSettings").mockRejectedValue(
      new BackendClientError("down", 500)
    );

    const after = await setPilotBaseline(8, "local only");
    expect(after.pilot?.baselineOpportunities).toBe(8);
    expect(after.pilot?.baselineNote).toBe("local only");
  });
});

describe("overlayPilotFromRemote", () => {
  it("replaces stale JSON baseline with Neon partner baseline", async () => {
    const { overlayPilotFromRemote } = await import("./sync-pilot");
    const store = await readStore();
    store.pilot = {
      baselineOpportunities: 4,
      baselineNote: "Cold-demo estimate",
      lastUploadedFileName: "Zerodha_batch_02",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    const next = overlayPilotFromRemote(store, {
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "partner agreed",
      weekly_export_count: null,
      last_uploaded_file_name: "Zerodha_batch_02",
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-20T22:00:00.000Z",
    });
    expect(next).not.toBe(store);
    expect(next.pilot?.baselineOpportunities).toBe(12);
    expect(next.pilot?.baselineNote).toBe("partner agreed");
    expect(next.pilot?.lastUploadedFileName).toBe("Zerodha_batch_02");
  });

  it("returns the same store when Neon matches JSON", async () => {
    const { overlayPilotFromRemote } = await import("./sync-pilot");
    const store = await readStore();
    store.pilot = {
      baselineOpportunities: 12,
      baselineNote: "partner agreed",
      updatedAt: "2026-08-20T22:00:00.000Z",
    };
    const next = overlayPilotFromRemote(store, {
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "partner agreed",
      weekly_export_count: null,
      last_uploaded_file_name: null,
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-20T22:00:00.000Z",
    });
    expect(next).toBe(store);
  });
});
