import { describe, expect, it } from "vitest";
import {
  INSIGHTS_SHADOW_TIP_COPY,
  INSIGHTS_SHADOW_TIP_STORAGE_KEY,
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
});
