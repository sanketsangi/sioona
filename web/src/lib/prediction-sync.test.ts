import { describe, expect, it } from "vitest";
import {
  hasSyncFailures,
  isNeonStubSignalId,
  neonPredictionIdFromStubSignalId,
  parsePredictionSync,
  parseSyncCreatedParam,
  parseSyncFailedParam,
  shouldShowSyncFailureBanner,
  syncQueryExtras,
} from "./prediction-sync";

describe("parsePredictionSync", () => {
  it("parses valid stats", () => {
    expect(
      parsePredictionSync({
        attempted: 3,
        created: 2,
        failed: 1,
        skipped: 0,
      })
    ).toEqual({ attempted: 3, created: 2, failed: 1, skipped: 0 });
  });

  it("returns null for invalid input", () => {
    expect(parsePredictionSync(null)).toBeNull();
    expect(parsePredictionSync({ attempted: "x" })).toBeNull();
  });
});

describe("hasSyncFailures / syncQueryExtras", () => {
  it("detects failures and builds query extras", () => {
    const sync = { attempted: 2, created: 1, failed: 1, skipped: 0 };
    expect(hasSyncFailures(sync)).toBe(true);
    expect(syncQueryExtras(sync)).toEqual({
      syncFailed: "1",
      syncCreated: "1",
    });
    expect(
      syncQueryExtras({ attempted: 1, created: 1, failed: 0, skipped: 0 })
    ).toEqual({ syncFailed: null, syncCreated: null });
  });
});

describe("parse sync URL params", () => {
  it("parses syncFailed and syncCreated", () => {
    expect(parseSyncFailedParam("3")).toBe(3);
    expect(parseSyncFailedParam("0")).toBe(0);
    expect(parseSyncFailedParam(undefined)).toBe(0);
    expect(parseSyncCreatedParam("2")).toBe(2);
  });
});

describe("shouldShowSyncFailureBanner", () => {
  it("hides stale URL failures when store is fully dual-written", () => {
    expect(
      shouldShowSyncFailureBanner(27, [
        { id: "sig_1", backendSignalId: "uuid-1" },
        { id: "sig_2", backendSignalId: "uuid-2" },
      ])
    ).toBe(false);
  });

  it("shows when URL reports failure and unsynced rows remain", () => {
    expect(
      shouldShowSyncFailureBanner(2, [
        { id: "sig_1", backendSignalId: "uuid-1" },
        { id: "sig_2" },
      ])
    ).toBe(true);
  });
});

describe("neon stub ids", () => {
  it("extracts prediction uuid", () => {
    expect(
      neonPredictionIdFromStubSignalId(
        "sig_neon_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
      )
    ).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(isNeonStubSignalId("sig_local_1")).toBe(false);
    expect(neonPredictionIdFromStubSignalId("sig_neon_")).toBeNull();
  });
});
