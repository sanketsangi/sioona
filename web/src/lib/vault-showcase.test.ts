import { describe, expect, it } from "vitest";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import {
  isVaultShowcaseFile,
  resolveVaultShowcaseKind,
  vaultShowcaseAlreadyActive,
  vaultShowcaseDisplayName,
  vaultShowcaseFailedMessage,
  vaultShowcaseLoadingLabel,
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

describe("vaultShowcaseLoadingLabel", () => {
  it("uses Title Case loading ellipsis", () => {
    expect(vaultShowcaseLoadingLabel("sample")).toBe("Loading Sample…");
    expect(vaultShowcaseLoadingLabel("partner")).toBe(
      "Loading Partner Demo…",
    );
    expect(vaultShowcaseFailedMessage("sample")).toContain("Sample");
  });
});
