import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { BackendClientError } from "./backend-client";
import {
  persistDeferredPilotRefresh,
  persistHealedPilot,
  localPilotSupersedesHeal,
  preserveLocalKeepSetFilename,
  syncPilotSettingsToBackend,
} from "./sync-pilot";
import {
  readStore,
  resetStore,
  setPilotBaseline,
  setSignalFeedback,
  writeStore,
} from "./store";

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

  it("keeps remote upload metadata unless the upload path opts in", async () => {
    const remote = {
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note: "keep",
      weekly_export_count: 2,
      last_uploaded_file_name: "previous.csv",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    };
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue(remote);
    vi.spyOn(backendClient, "putPilotSettings").mockResolvedValue({
      ...remote,
      weekly_export_count: 3,
      last_uploaded_file_name: "real-partner-export.week2.local.csv",
    });
    const local = {
      baselineOpportunities: 4,
      baselineNote: "keep",
      weeklyExportCount: 3,
      lastUploadedFileName: "real-partner-export.week2.local.csv",
      updatedAt: "2026-10-13T00:00:00.000Z",
    };

    await syncPilotSettingsToBackend("tenant_demo", local);
    expect(backendClient.putPilotSettings).toHaveBeenLastCalledWith(
      "tenant_demo",
      expect.objectContaining({
        weekly_export_count: 2,
        last_uploaded_file_name: "previous.csv",
      }),
    );

    await syncPilotSettingsToBackend("tenant_demo", local, {
      overwriteUploadMetadata: true,
    });
    expect(backendClient.putPilotSettings).toHaveBeenLastCalledWith(
      "tenant_demo",
      expect.objectContaining({
        weekly_export_count: 3,
        last_uploaded_file_name: "real-partner-export.week2.local.csv",
      }),
    );
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

  it("interleaves upload metadata persistence and a stale baseline save, verifying both survive", async () => {
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    try {
      let currentBackendPilot: backendClient.BackendPilotSettings = {
        id: "pilot-1",
        tenant_id: "tenant_demo",
        baseline_opportunities: 5,
        baseline_note: "old baseline",
        weekly_export_count: 3,
        last_uploaded_file_name: "new.csv",
        created_at: "2026-08-14T00:00:00.000Z",
        updated_at: "2026-08-14T00:00:00.000Z",
      };

      vi.spyOn(backendClient, "getPilotSettings").mockImplementation(async () => currentBackendPilot);
      vi.spyOn(backendClient, "getActiveUploads").mockResolvedValue([]);
      vi.spyOn(backendClient, "getConversations").mockResolvedValue([]);
      vi.spyOn(backendClient, "getTenantSignalsPage").mockResolvedValue({ predictions: [], next_cursor: null });
      vi.spyOn(backendClient, "getSupervisedActionDecisions").mockResolvedValue([]);
      vi.spyOn(backendClient, "getDetectionResume").mockResolvedValue(null);
      vi.spyOn(backendClient, "getTaxonomyOverrides").mockResolvedValue({});
      vi.spyOn(backendClient, "putPilotSettings").mockImplementation(async (_tenant, input) => {
        currentBackendPilot = {
          ...currentBackendPilot,
          baseline_opportunities: input.baseline_opportunities,
          baseline_note: input.baseline_note,
          weekly_export_count: input.weekly_export_count,
          last_uploaded_file_name: input.last_uploaded_file_name,
        };
        return currentBackendPilot;
      });

      const store = await readStore();
      store.pilot = {
        baselineOpportunities: 5,
        baselineNote: "old baseline",
        weeklyExportCount: 2,
        lastUploadedFileName: "old.csv",
      };
      await writeStore(store);

      const after = await setPilotBaseline(15, "new note");

      expect(after.pilot?.baselineOpportunities).toBe(15);
      expect(after.pilot?.baselineNote).toBe("new note");
      expect(after.pilot?.weeklyExportCount).toBe(3);
      expect(after.pilot?.lastUploadedFileName).toBe("new.csv");

      const backendState = await backendClient.getPilotSettings("tenant_demo");
      expect(backendState?.baseline_opportunities).toBe(15);
      expect(backendState?.baseline_note).toBe("new note");
      expect(backendState?.weekly_export_count).toBe(3);
      expect(backendState?.last_uploaded_file_name).toBe("new.csv");

      const { promises: fs } = await import("node:fs");
      const mkdir = vi.spyOn(fs, "mkdir");
      const writeFile = vi.spyOn(fs, "writeFile");
      const rename = vi.spyOn(fs, "rename");
      await setPilotBaseline(16, "newer note");
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("persistHealedPilot", () => {
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

  it("writes only the healed pilot onto the latest snapshot", async () => {
    const original = await readStore();
    const target = original.signals[0];
    expect(target).toBeTruthy();

    const healed = {
      ...original,
      pilot: {
        baselineOpportunities: 12,
        baselineNote: "healed from Neon",
        updatedAt: "2026-08-30T00:00:00.000Z",
      },
    };

    await setSignalFeedback(target.id, "correct", "keep me");
    await persistHealedPilot(healed, original);

    const after = await readStore();
    expect(after.pilot?.baselineOpportunities).toBe(12);
    expect(after.pilot?.baselineNote).toBe("healed from Neon");
    expect(after.signals.find((s) => s.id === target.id)?.feedback?.label).toBe(
      "correct"
    );
    expect(after.signals.find((s) => s.id === target.id)?.feedback?.note).toBe(
      "keep me"
    );
  });

  it("does not write when overlay returned the same store", async () => {
    const original = await readStore();
    const writeSpy = vi.spyOn(await import("./store"), "writeStore");
    await persistHealedPilot(original, original);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("persistDeferredPilotRefresh", () => {
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

  it("overlays Neon pilot onto the latest snapshot without clobbering feedback", async () => {
    const original = await readStore();
    const target = original.signals[0];
    expect(target).toBeTruthy();
    await setSignalFeedback(target.id, "correct", "keep me");

    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "healed after paint",
      weekly_export_count: 2,
      last_uploaded_file_name: "Groww_batch_02",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    });

    await persistDeferredPilotRefresh("tenant_demo");

    const after = await readStore();
    expect(after.pilot?.baselineOpportunities).toBe(12);
    expect(after.pilot?.baselineNote).toBe("healed after paint");
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.pilot?.lastUploadedFileName).toBe(
      original.pilot?.lastUploadedFileName ?? "Groww_batch_02",
    );
    expect(after.signals.find((s) => s.id === target.id)?.feedback?.label).toBe(
      "correct"
    );
    expect(after.signals.find((s) => s.id === target.id)?.feedback?.note).toBe(
      "keep me"
    );
  });

  it("does not revert a just-written JSON filename to stale Neon", async () => {
    const original = await readStore();
    await writeStore({
      ...original,
      pilot: {
        ...original.pilot,
        baselineOpportunities: original.pilot?.baselineOpportunities ?? 0,
        lastUploadedFileName: "Zerodha_batch_02",
      },
    });

    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note: "Cold-demo estimate",
      weekly_export_count: 0,
      last_uploaded_file_name: "Groww_batch_02",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    });

    await persistDeferredPilotRefresh("tenant_demo");

    const after = await readStore();
    expect(after.pilot?.lastUploadedFileName).toBe("Zerodha_batch_02");
  });

  it("does not revert a keep-set written during the Neon GET", async () => {
    const original = await readStore();
    expect(original.pilot?.lastUploadedFileName).not.toBe("Zerodha_batch_02");

    vi.spyOn(backendClient, "getPilotSettings").mockImplementation(async () => {
      const latest = await readStore();
      await writeStore({
        ...latest,
        pilot: {
          baselineOpportunities: latest.pilot?.baselineOpportunities ?? 0,
          lastUploadedFileName: "Zerodha_batch_02",
          updatedAt: "2026-09-04T20:00:00.000Z",
        },
      });
      return {
        id: "pilot-1",
        tenant_id: "tenant_demo",
        baseline_opportunities: 4,
        baseline_note: "Cold-demo estimate",
        weekly_export_count: 0,
        last_uploaded_file_name: "Groww_batch_02",
        created_at: "2026-08-14T00:00:00.000Z",
        updated_at: "2026-08-30T00:00:00.000Z",
      };
    });

    await persistDeferredPilotRefresh("tenant_demo");

    const after = await readStore();
    expect(after.pilot?.lastUploadedFileName).toBe("Zerodha_batch_02");
    expect(after.pilot?.updatedAt).toBe("2026-09-04T20:00:00.000Z");
  });

  it("skips when the stored tenant does not match", async () => {
    const getSpy = vi.spyOn(backendClient, "getPilotSettings");
    await persistDeferredPilotRefresh("tenant_other");
    expect(getSpy).not.toHaveBeenCalled();
  });
});

describe("localPilotSupersedesHeal", () => {
  it("is true when the keep-set filename changed during the GET", () => {
    expect(
      localPilotSupersedesHeal(
        {
          baselineOpportunities: 12,
          lastUploadedFileName: "Zerodha_batch_02",
        },
        {
          baselineOpportunities: 4,
          lastUploadedFileName: "Groww_batch_02",
        },
      ),
    ).toBe(true);
  });

  it("is true when JSON updatedAt is newer than the pre-GET snapshot", () => {
    expect(
      localPilotSupersedesHeal(
        {
          baselineOpportunities: 4,
          lastUploadedFileName: "Groww_batch_02",
          updatedAt: "2026-09-04T20:00:00.000Z",
        },
        {
          baselineOpportunities: 4,
          lastUploadedFileName: "Groww_batch_02",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ),
    ).toBe(true);
  });

  it("is false when filename and updatedAt are unchanged", () => {
    expect(
      localPilotSupersedesHeal(
        {
          baselineOpportunities: 4,
          lastUploadedFileName: "Groww_batch_02",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
        {
          baselineOpportunities: 4,
          lastUploadedFileName: "Groww_batch_02",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ),
    ).toBe(false);
  });
});

describe("preserveLocalKeepSetFilename", () => {
  it("keeps the JSON keep-set name when Neon differs", async () => {
    const latest = await readStore();
    latest.pilot = {
      baselineOpportunities: 4,
      lastUploadedFileName: "Zerodha_batch_02",
    };
    const healed = {
      ...latest,
      pilot: {
        baselineOpportunities: 4,
        lastUploadedFileName: "Groww_batch_02",
      },
    };
    const next = preserveLocalKeepSetFilename(healed, latest);
    expect(next.pilot?.lastUploadedFileName).toBe("Zerodha_batch_02");
  });

  it("restores keep-set name when healed pilot is missing", async () => {
    const latest = await readStore();
    latest.pilot = {
      baselineOpportunities: 4,
      lastUploadedFileName: "Zerodha_batch_02",
    };
    const healed = { ...latest, pilot: undefined };
    const next = preserveLocalKeepSetFilename(healed, latest);
    expect(next.pilot?.lastUploadedFileName).toBe("Zerodha_batch_02");
    expect(next.pilot?.baselineOpportunities).toBe(4);
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

  it("keeps JSON partner baseline when Neon is still cold-demo", async () => {
    const { overlayPilotFromRemote } = await import("./sync-pilot");
    const store = await readStore();
    store.pilot = {
      baselineOpportunities: 12,
      baselineNote: "partner agreed",
      lastUploadedFileName: "Zerodha_batch_02",
      updatedAt: "2026-08-20T22:00:00.000Z",
    };
    const next = overlayPilotFromRemote(store, {
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note:
        "Cold-demo estimate: what a busy desk typically flags without Shadow Mode. Replace with the partner’s real count on Eval.",
      weekly_export_count: null,
      last_uploaded_file_name: "Zerodha_batch_02",
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-20T22:05:00.000Z",
    });
    expect(next.pilot?.baselineOpportunities).toBe(12);
    expect(next.pilot?.baselineNote).toBe("partner agreed");
    expect(next.pilot?.lastUploadedFileName).toBe("Zerodha_batch_02");
  });
});
