import { describe, expect, it } from "vitest";
import {
  INSIGHTS_SHADOW_TIP_COPY,
  INSIGHTS_SHADOW_TIP_STORAGE_KEY,
  isInsightsShadowTipDismissed,
  persistInsightsShadowTipDismissed,
} from "./insights-shadow-tip";

describe("insights shadow tip", () => {
  it("matches Help: review only, nothing sent", () => {
    expect(INSIGHTS_SHADOW_TIP_STORAGE_KEY).toBe(
      "sioona.insights.shadowTip.dismissed",
    );
    expect(INSIGHTS_SHADOW_TIP_COPY).toContain("Shadow Mode");
    expect(INSIGHTS_SHADOW_TIP_COPY).toContain("drafts only");
    expect(INSIGHTS_SHADOW_TIP_COPY).toContain("nothing is sent");
    expect(INSIGHTS_SHADOW_TIP_COPY).not.toMatch(/CRM|send to customer/i);
  });

  it("reads and persists dismiss without re-showing", () => {
    const store = new Map<string, string>();
    const getItem = (key: string) => store.get(key) ?? null;
    const setItem = (key: string, value: string) => {
      store.set(key, value);
    };

    expect(isInsightsShadowTipDismissed(getItem)).toBe(false);
    persistInsightsShadowTipDismissed(setItem);
    expect(store.get(INSIGHTS_SHADOW_TIP_STORAGE_KEY)).toBe("1");
    expect(isInsightsShadowTipDismissed(getItem)).toBe(true);
  });

  it("treats storage errors as not dismissed / no-throw persist", () => {
    expect(
      isInsightsShadowTipDismissed(() => {
        throw new Error("private mode");
      }),
    ).toBe(false);
    expect(() =>
      persistInsightsShadowTipDismissed(() => {
        throw new Error("quota");
      }),
    ).not.toThrow();
  });
});
