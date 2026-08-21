import { describe, expect, it } from "vitest";
import {
  CONFIRM_PARTNER_DEMO_REPLACE_FIELD,
  isPartnerDemoKeepSetActive,
  parseConfirmPartnerDemoReplace,
  requiresPartnerDemoReplaceConfirm,
} from "./partner-demo-replace-guard";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "./testing-json-eval";

describe("isPartnerDemoKeepSetActive", () => {
  it("is true only for Partner Demo Zerodha basename", () => {
    expect(isPartnerDemoKeepSetActive(ZERODHA_BATCH02_SAMPLE_NAME)).toBe(true);
    expect(isPartnerDemoKeepSetActive(` ${ZERODHA_BATCH02_SAMPLE_NAME} `)).toBe(
      true
    );
    expect(isPartnerDemoKeepSetActive(GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(isPartnerDemoKeepSetActive("zerodha_batch_02.json")).toBe(false);
    expect(isPartnerDemoKeepSetActive(undefined)).toBe(false);
    expect(isPartnerDemoKeepSetActive(null)).toBe(false);
    expect(isPartnerDemoKeepSetActive("")).toBe(false);
  });
});

describe("requiresPartnerDemoReplaceConfirm", () => {
  it("requires confirm when Partner Demo is active and upload will replace", () => {
    expect(
      requiresPartnerDemoReplaceConfirm({
        lastUploadedFileName: ZERODHA_BATCH02_SAMPLE_NAME,
        willReplace: true,
        confirmed: false,
      })
    ).toBe(true);
  });

  it("does not require confirm when already confirmed", () => {
    expect(
      requiresPartnerDemoReplaceConfirm({
        lastUploadedFileName: ZERODHA_BATCH02_SAMPLE_NAME,
        willReplace: true,
        confirmed: true,
      })
    ).toBe(false);
  });

  it("does not require confirm for mid-week upsert (willReplace false)", () => {
    expect(
      requiresPartnerDemoReplaceConfirm({
        lastUploadedFileName: ZERODHA_BATCH02_SAMPLE_NAME,
        willReplace: false,
        confirmed: false,
      })
    ).toBe(false);
  });

  it("does not require confirm on Day-1 Groww / Reset last upload", () => {
    expect(
      requiresPartnerDemoReplaceConfirm({
        lastUploadedFileName: GROWW_SHOWCASE_SAMPLE_NAME,
        willReplace: true,
        confirmed: false,
      })
    ).toBe(false);
  });
});

describe("parseConfirmPartnerDemoReplace", () => {
  it("accepts true and 1", () => {
    const yes = new FormData();
    yes.append(CONFIRM_PARTNER_DEMO_REPLACE_FIELD, "true");
    expect(parseConfirmPartnerDemoReplace(yes)).toBe(true);

    const one = new FormData();
    one.append(CONFIRM_PARTNER_DEMO_REPLACE_FIELD, "1");
    expect(parseConfirmPartnerDemoReplace(one)).toBe(true);

    const no = new FormData();
    expect(parseConfirmPartnerDemoReplace(no)).toBe(false);
  });
});
