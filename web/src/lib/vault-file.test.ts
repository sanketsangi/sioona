import { describe, expect, it } from "vitest";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import {
  defaultInsightsHref,
  parseVaultFile,
  resolveInsightsVaultFile,
  resolveVaultActiveFile,
  vaultFileEmptyNext,
  vaultFileMatchesKeepSet,
  vaultInsightsHref,
} from "./vault-file";

describe("parseVaultFile", () => {
  it("trims and rejects blanks", () => {
    expect(parseVaultFile("  Groww_batch_02  ")).toBe("Groww_batch_02");
    expect(parseVaultFile("")).toBeNull();
    expect(parseVaultFile("   ")).toBeNull();
    expect(parseVaultFile(undefined)).toBeNull();
    expect(parseVaultFile(null)).toBeNull();
  });
});

describe("resolveInsightsVaultFile", () => {
  it("defaults bare Insights to Sample", () => {
    expect(resolveInsightsVaultFile(null)).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(resolveInsightsVaultFile(undefined)).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(resolveInsightsVaultFile("")).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });

  it("keeps an explicit ?file=", () => {
    expect(resolveInsightsVaultFile(ZERODHA_BATCH02_SAMPLE_NAME)).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME,
    );
    expect(resolveInsightsVaultFile("  user-upload.csv  ")).toBe(
      "user-upload.csv",
    );
  });
});

describe("vaultInsightsHref", () => {
  it("opens Insights with file scope", () => {
    const href = vaultInsightsHref(GROWW_SHOWCASE_SAMPLE_NAME);
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("view")).toBe("insights");
    expect(params.get("file")).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });
});

describe("defaultInsightsHref", () => {
  it("opens Insights scoped to Sample", () => {
    const href = defaultInsightsHref();
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("view")).toBe("insights");
    expect(params.get("file")).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });
});

describe("vaultFileMatchesKeepSet", () => {
  it("matches Sample names with or without extension", () => {
    expect(
      vaultFileMatchesKeepSet(GROWW_SHOWCASE_SAMPLE_NAME, "Groww_batch_02.csv"),
    ).toBe(true);
    expect(
      vaultFileMatchesKeepSet(
        ZERODHA_BATCH02_SAMPLE_NAME,
        ZERODHA_BATCH02_SAMPLE_NAME,
      ),
    ).toBe(true);
  });

  it("matches exact upload basenames", () => {
    expect(
      vaultFileMatchesKeepSet(
        "Zerodha_week_5_batch_01.json",
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(true);
  });

  it("is false when keep-set is a different pack", () => {
    expect(
      vaultFileMatchesKeepSet(
        GROWW_SHOWCASE_SAMPLE_NAME,
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(false);
    expect(
      vaultFileMatchesKeepSet(
        ZERODHA_BATCH02_SAMPLE_NAME,
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(false);
  });
});

describe("resolveVaultActiveFile", () => {
  it("prefers URL file over keep-set breadcrumb", () => {
    expect(
      resolveVaultActiveFile({
        vaultFile: GROWW_SHOWCASE_SAMPLE_NAME,
        lastUploadedFileName: "Zerodha_week_5_batch_01.json",
      }),
    ).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });

  it("falls back to last upload when URL omits file", () => {
    expect(
      resolveVaultActiveFile({
        vaultFile: null,
        lastUploadedFileName: "Zerodha_week_5_batch_01.json",
      }),
    ).toBe("Zerodha_week_5_batch_01.json");
  });

  it("defaults to Sample when URL and keep-set are empty", () => {
    expect(
      resolveVaultActiveFile({
        vaultFile: null,
        lastUploadedFileName: null,
      }),
    ).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(
      resolveVaultActiveFile({
        vaultFile: "  ",
        lastUploadedFileName: "   ",
      }),
    ).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });
});

describe("vaultFileEmptyNext", () => {
  it("points Sample and Partner Demo at Upload", () => {
    expect(vaultFileEmptyNext(GROWW_SHOWCASE_SAMPLE_NAME).label).toBe(
      "Open Upload",
    );
    expect(vaultFileEmptyNext(ZERODHA_BATCH02_SAMPLE_NAME).href).toContain(
      "view=upload",
    );
  });

  it("points unknown uploads at Uploaded Chats", () => {
    const next = vaultFileEmptyNext("partner-export.json");
    expect(next.label).toBe("Uploaded Chats");
    expect(next.title).toBe("File Not Loaded");
  });
});
