import { describe, expect, it } from "vitest";
import {
  catalogFileKey,
  claimCatalogBasename,
  lastUploadedFileName,
} from "./upload-filename";

describe("lastUploadedFileName", () => {
  it("keeps a real basename with extension", () => {
    expect(lastUploadedFileName("groww_batch_02.csv")).toBe(
      "groww_batch_02.csv"
    );
  });

  it("strips directory prefixes", () => {
    expect(lastUploadedFileName("/tmp/exports/groww_batch_02.csv")).toBe(
      "groww_batch_02.csv"
    );
    expect(lastUploadedFileName("C:\\exports\\week1.csv")).toBe("week1.csv");
  });

  it("returns undefined for empty names", () => {
    expect(lastUploadedFileName("")).toBeUndefined();
    expect(lastUploadedFileName("   ")).toBeUndefined();
    expect(lastUploadedFileName(null)).toBeUndefined();
    expect(lastUploadedFileName(undefined)).toBeUndefined();
  });
});

describe("claimCatalogBasename", () => {
  it("keeps the first copy and suffixes the next copies before the extension", () => {
    const taken = new Set<string>();
    expect(claimCatalogBasename("batch_095.json", taken)).toBe(
      "batch_095.json",
    );
    expect(claimCatalogBasename("batch_095.json", taken)).toBe(
      "batch_095 (2).json",
    );
    expect(claimCatalogBasename("BATCH_095.JSON", taken)).toBe(
      "BATCH_095 (3).JSON",
    );
    expect(taken.has(catalogFileKey("batch_095 (3).json"))).toBe(true);
  });

  it("suffixes a name that has no extension", () => {
    const taken = new Set([catalogFileKey("notes")]);
    expect(claimCatalogBasename("notes", taken)).toBe("notes (2)");
  });
});
