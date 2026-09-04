import { describe, expect, it } from "vitest";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import {
  isVaultShowcaseFile,
  resolveVaultShowcaseKind,
  shouldLandShowcaseLoad,
  vaultShowcaseAlreadyActive,
  vaultShowcaseCancelHref,
  vaultShowcaseExpectation,
  vaultShowcaseFailedMessage,
  vaultShowcaseLoadingLabel,
  vaultShowcaseStallMessage,
  vaultShowcaseStoreAction,
} from "./vault-showcase";

describe("resolveVaultShowcaseKind", () => {
  it("maps Sample and Partner Demo catalog names", () => {
    expect(resolveVaultShowcaseKind(GROWW_SHOWCASE_SAMPLE_NAME)).toBe(
      "sample",
    );
    expect(resolveVaultShowcaseKind("Groww_batch_02.csv")).toBe("sample");
    expect(resolveVaultShowcaseKind(ZERODHA_BATCH02_SAMPLE_NAME)).toBe(
      "partner",
    );
  });

  it("is null for partner uploads", () => {
    expect(resolveVaultShowcaseKind("Zerodha_week_5_batch_01.json")).toBeNull();
    expect(isVaultShowcaseFile("user-upload.csv")).toBe(false);
  });
});

describe("vaultShowcaseAlreadyActive", () => {
  it("is true when keep-set matches the showcase pack", () => {
    expect(
      vaultShowcaseAlreadyActive("sample", GROWW_SHOWCASE_SAMPLE_NAME),
    ).toBe(true);
    expect(
      vaultShowcaseAlreadyActive("sample", "Groww_batch_02.csv"),
    ).toBe(true);
    expect(
      vaultShowcaseAlreadyActive("partner", ZERODHA_BATCH02_SAMPLE_NAME),
    ).toBe(true);
  });

  it("is false when keep-set is a different pack", () => {
    expect(
      vaultShowcaseAlreadyActive("sample", ZERODHA_BATCH02_SAMPLE_NAME),
    ).toBe(false);
    expect(
      vaultShowcaseAlreadyActive("partner", "Zerodha_week_5_batch_01.json"),
    ).toBe(false);
    expect(vaultShowcaseAlreadyActive("partner", null)).toBe(false);
  });
});
describe("vaultShowcaseStoreAction", () => {
  it("uses reset for Sample and partner_demo for Partner Demo", () => {
    expect(vaultShowcaseStoreAction("sample")).toBe("reset");
    expect(vaultShowcaseStoreAction("partner")).toBe("partner_demo");
  });
});

describe("vaultShowcaseLoadingLabel", () => {
  it("uses Finding signals for both showcase packs", () => {
    expect(vaultShowcaseLoadingLabel("sample")).toBe("Finding signals…");
    expect(vaultShowcaseLoadingLabel("partner")).toBe("Finding signals…");
    expect(vaultShowcaseExpectation()).toMatch(/20 seconds/);
    expect(vaultShowcaseStallMessage("partner")).toMatch(/longer than expected/);
    expect(vaultShowcaseFailedMessage("sample")).toContain("Sample");
  });
});

describe("shouldLandShowcaseLoad", () => {
  it("lands a finished wipe even after the 30s stall painted", () => {
    expect(
      shouldLandShowcaseLoad({
        runId: 1,
        currentRunId: 1,
      }),
    ).toBe(true);
  });

  it("lands when Cancel unmounted after consume already finished", () => {
    expect(
      shouldLandShowcaseLoad({
        cancelled: true,
        runId: 1,
        currentRunId: 1,
      }),
    ).toBe(true);
  });

  it("does not land a Retry-superseded run", () => {
    expect(
      shouldLandShowcaseLoad({
        cancelled: false,
        runId: 1,
        currentRunId: 2,
      }),
    ).toBe(false);
  });
});

describe("vaultShowcaseCancelHref", () => {
  it("returns the current keep-set Insights href", () => {
    const href = vaultShowcaseCancelHref("Zerodha_week_5_batch_01.json");
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("view")).toBe("insights");
    expect(params.get("file")).toBe("Zerodha_week_5_batch_01.json");
  });

  it("goes to Upload when the keep-set is empty so Cancel leaves the load", () => {
    expect(vaultShowcaseCancelHref(null)).toBe("/?view=upload");
    expect(vaultShowcaseCancelHref(undefined)).toBe("/?view=upload");
    expect(vaultShowcaseCancelHref("   ")).toBe("/?view=upload");
  });
});
