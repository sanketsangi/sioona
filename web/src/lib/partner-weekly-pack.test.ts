import { describe, expect, it } from "vitest";
import {
  CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD,
  isHeldOutWeeklyPackBasename,
  isPartnerWeeklyPackBasename,
  parseConfirmHeldOutWeeklyIngest,
  requiresHeldOutWeeklyIngestConfirm,
  WEEK4_BATCH02_HELD_OUT_BASENAME,
} from "./partner-weekly-pack";

describe("isPartnerWeeklyPackBasename", () => {
  it("matches week1 CSV, weekN CSV, and company weekly JSON", () => {
    expect(isPartnerWeeklyPackBasename("real-partner-export.local.csv")).toBe(
      true
    );
    expect(
      isPartnerWeeklyPackBasename("real-partner-export.week5.local.csv")
    ).toBe(true);
    expect(
      isPartnerWeeklyPackBasename("Zerodha_week_4_batch_01.json")
    ).toBe(true);
    expect(
      isPartnerWeeklyPackBasename("Zerodha_week_5_batch_01.json")
    ).toBe(true);
    expect(
      isPartnerWeeklyPackBasename(
        "/Users/sanket/Documents/Synthetic-Data/Zerodha_week_5_batch_01.json"
      )
    ).toBe(true);
  });

  it("is false for unknown names and Partner Demo / eval packs", () => {
    expect(isPartnerWeeklyPackBasename("user-upload.csv")).toBe(false);
    expect(isPartnerWeeklyPackBasename("Groww_batch_02.csv")).toBe(false);
    expect(isPartnerWeeklyPackBasename("partner-shaped-labeled.csv")).toBe(
      false
    );
    expect(isPartnerWeeklyPackBasename("Zerodha_batch_02")).toBe(false);
    expect(isPartnerWeeklyPackBasename("zerodha_batch_02.json")).toBe(false);
    expect(isPartnerWeeklyPackBasename(undefined)).toBe(false);
    expect(isPartnerWeeklyPackBasename("")).toBe(false);
  });
});

describe("isHeldOutWeeklyPackBasename", () => {
  it("is true only for Week-4 Batch-02", () => {
    expect(isHeldOutWeeklyPackBasename(WEEK4_BATCH02_HELD_OUT_BASENAME)).toBe(
      true
    );
    expect(
      isHeldOutWeeklyPackBasename("zerodha_week_4_batch_02.json")
    ).toBe(true);
    expect(isPartnerWeeklyPackBasename(WEEK4_BATCH02_HELD_OUT_BASENAME)).toBe(
      true
    );
    expect(
      isHeldOutWeeklyPackBasename("Zerodha_week_4_batch_01.json")
    ).toBe(false);
    expect(
      isHeldOutWeeklyPackBasename("Zerodha_week_5_batch_01.json")
    ).toBe(false);
    expect(isHeldOutWeeklyPackBasename("Zerodha_batch_02")).toBe(false);
  });
});

describe("requiresHeldOutWeeklyIngestConfirm", () => {
  it("requires confirm for Batch-02 even when the upload would upsert", () => {
    expect(
      requiresHeldOutWeeklyIngestConfirm({
        uploadedBasename: WEEK4_BATCH02_HELD_OUT_BASENAME,
        confirmed: false,
      })
    ).toBe(true);
  });

  it("does not require confirm when already confirmed", () => {
    expect(
      requiresHeldOutWeeklyIngestConfirm({
        uploadedBasename: WEEK4_BATCH02_HELD_OUT_BASENAME,
        confirmed: true,
      })
    ).toBe(false);
  });

  it("does not require confirm for week5-style or unknown names", () => {
    expect(
      requiresHeldOutWeeklyIngestConfirm({
        uploadedBasename: "Zerodha_week_5_batch_01.json",
        confirmed: false,
      })
    ).toBe(false);
    expect(
      requiresHeldOutWeeklyIngestConfirm({
        uploadedBasename: "user-upload.csv",
        confirmed: false,
      })
    ).toBe(false);
  });
});

describe("parseConfirmHeldOutWeeklyIngest", () => {
  it("accepts true and 1", () => {
    const yes = new FormData();
    yes.append(CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD, "true");
    expect(parseConfirmHeldOutWeeklyIngest(yes)).toBe(true);

    const one = new FormData();
    one.append(CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD, "1");
    expect(parseConfirmHeldOutWeeklyIngest(one)).toBe(true);

    const no = new FormData();
    expect(parseConfirmHeldOutWeeklyIngest(no)).toBe(false);
  });
});
