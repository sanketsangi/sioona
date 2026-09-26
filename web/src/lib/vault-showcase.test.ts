import { describe, expect, it } from "vitest";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import {
  initialVaultShowcaseLoadUi,
  isSampleToPartnerSwitch,
  isVaultShowcaseFile,
  reduceVaultShowcaseLoadUi,
  resolveVaultShowcaseKind,
  shouldLandShowcaseLoad,
  vaultShowcaseAlreadyActive,
  vaultShowcaseCanStartNewAttempt,
  vaultShowcaseCancelHref,
  vaultShowcaseDisplayName,
  vaultShowcaseExpectation,
  vaultShowcaseFailedMessage,
  vaultShowcaseLoadingLabel,
  vaultShowcaseShowRetry,
  vaultShowcaseStallMessage,
  vaultShowcaseStoreAction,
  vaultShowcaseWaitEmptyNext,
  vaultShowcaseInsightsHref,
  vaultShowcaseNavigateOnly,
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
    expect(
      vaultShowcaseAlreadyActive("partner", "Zerodha_week_5_batch_02.json"),
    ).toBe(false);
    expect(vaultShowcaseAlreadyActive("partner", null)).toBe(false);
  });
});

describe("vaultShowcaseStoreAction", () => {
  it("uses reset for Sample and partner_demo for Partner Demo", () => {
    expect(vaultShowcaseStoreAction("sample")).toBe("reset");
    expect(vaultShowcaseStoreAction("partner")).toBe("partner_demo");
  });

  it("Partner Demo display name is the Zerodha_batch_02 catalog id", () => {
    expect(vaultShowcaseDisplayName("partner")).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME,
    );
  });
});

describe("vaultShowcaseInsightsHref / navigateOnly", () => {
  it("builds Insights hrefs and skips wipe when already active", () => {
    const sample = vaultShowcaseInsightsHref("sample", { replaced: true });
    expect(sample).toContain("file=Groww_batch_02");
    expect(sample).toContain("replaced=1");
    expect(sample).not.toContain("demo=");

    const partner = vaultShowcaseInsightsHref("partner");
    expect(partner).toContain("demo=1");
    expect(partner).toContain(encodeURIComponent(ZERODHA_BATCH02_SAMPLE_NAME));

    expect(vaultShowcaseNavigateOnly("sample", GROWW_SHOWCASE_SAMPLE_NAME)).toBe(
      true,
    );
    expect(vaultShowcaseNavigateOnly("partner", GROWW_SHOWCASE_SAMPLE_NAME)).toBe(
      false,
    );
  });
});

describe("isSampleToPartnerSwitch", () => {
  it("is only Sample keep-set to Partner Demo file", () => {
    expect(
      isSampleToPartnerSwitch(
        ZERODHA_BATCH02_SAMPLE_NAME,
        GROWW_SHOWCASE_SAMPLE_NAME,
      ),
    ).toBe(true);
    expect(
      isSampleToPartnerSwitch(
        GROWW_SHOWCASE_SAMPLE_NAME,
        ZERODHA_BATCH02_SAMPLE_NAME,
      ),
    ).toBe(false);
    expect(
      isSampleToPartnerSwitch(
        ZERODHA_BATCH02_SAMPLE_NAME,
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(false);
  });
});

describe("vaultShowcaseLoadingLabel", () => {
  it("uses Finding signals for both showcase packs", () => {
    expect(vaultShowcaseLoadingLabel("sample")).toBe("Finding signals…");
    expect(vaultShowcaseLoadingLabel("partner")).toBe("Finding signals…");
    expect(vaultShowcaseExpectation()).toMatch(/20 seconds/);
    expect(vaultShowcaseStallMessage("partner")).toMatch(/longer than expected/);
    expect(vaultShowcaseStallMessage("sample")).toMatch(/Cancel opens Upload/);
    expect(vaultShowcaseStallMessage("sample")).not.toMatch(/current batch/);
    expect(vaultShowcaseStallMessage("sample")).not.toMatch(/Retry/);
    expect(vaultShowcaseFailedMessage("sample")).toContain("Sample");
  });
});

describe("vaultShowcaseWaitEmptyNext", () => {
  it("quiet Insights empty Cancel goes to Upload while seeding", () => {
    const next = vaultShowcaseWaitEmptyNext("sample");
    expect(next.title).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(next.description).toContain("Finding signals…");
    expect(next.description).toContain("20 seconds");
    expect(next.label).toBe("Cancel");
    expect(next.href).toBe("/?view=upload");
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
  it("returns the current keep-set Insights href after wipe settles", () => {
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

  it("in-flight Cancel is Upload even when keepSetFileName is set", () => {
    expect(
      vaultShowcaseCancelHref("Zerodha_week_5_batch_01.json", {
        wipeInFlight: true,
      }),
    ).toBe("/?view=upload");
    expect(
      vaultShowcaseCancelHref(GROWW_SHOWCASE_SAMPLE_NAME, {
        wipeInFlight: true,
      }),
    ).toBe("/?view=upload");
  });
});

describe("reduceVaultShowcaseLoadUi", () => {
  it("soft-stall keeps wipe in flight and blocks Retry", () => {
    const started = initialVaultShowcaseLoadUi("sample");
    const stalled = reduceVaultShowcaseLoadUi(started, {
      type: "stall",
      kind: "sample",
    });
    expect(stalled.wipeInFlight).toBe(true);
    expect(stalled.hardFailed).toBe(false);
    expect(vaultShowcaseShowRetry(stalled)).toBe(false);
    expect(vaultShowcaseCanStartNewAttempt(stalled)).toBe(false);
    expect(
      vaultShowcaseCancelHref("keep.json", {
        wipeInFlight: stalled.wipeInFlight,
      }),
    ).toBe("/?view=upload");
  });

  it("hard-fail after stall unlocks Retry for one new attempt", () => {
    const stalled = reduceVaultShowcaseLoadUi(
      initialVaultShowcaseLoadUi("partner"),
      { type: "stall", kind: "partner" },
    );
    const failed = reduceVaultShowcaseLoadUi(stalled, {
      type: "hard_fail",
      message: "boom",
    });
    expect(failed.wipeInFlight).toBe(false);
    expect(failed.hardFailed).toBe(true);
    expect(vaultShowcaseShowRetry(failed)).toBe(true);
    expect(vaultShowcaseCanStartNewAttempt(failed)).toBe(true);
  });

  it("success after stall keeps Cancel on Upload until Insights land", () => {
    const stalled = reduceVaultShowcaseLoadUi(
      initialVaultShowcaseLoadUi("sample"),
      { type: "stall", kind: "sample" },
    );
    const landed = reduceVaultShowcaseLoadUi(stalled, { type: "success" });
    // Hold wipeInFlight through router.replace — stall error still painted.
    expect(landed.wipeInFlight).toBe(true);
    expect(landed.error).toMatch(/longer than expected/);
    expect(vaultShowcaseShowRetry(landed)).toBe(false);
    expect(
      vaultShowcaseCancelHref("Zerodha_week_5_batch_01.json", {
        wipeInFlight: landed.wipeInFlight,
      }),
    ).toBe("/?view=upload");
    expect(shouldLandShowcaseLoad({ runId: 1, currentRunId: 1 })).toBe(true);
  });
});
