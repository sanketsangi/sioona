import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

import { InsightsPartnerDemoAction } from "@/components/InsightsPartnerDemoAction";
import { ZERODHA_BATCH02_SAMPLE_NAME } from "@/lib/partner-demo-replace-guard";
import {
  vaultShowcaseAlreadyActive,
  vaultShowcaseDisplayName,
  vaultShowcaseStoreAction,
} from "@/lib/vault-showcase";

describe("InsightsPartnerDemoAction", () => {
  it("renders the shared Run Partner Demo CTA (same label as Upload)", () => {
    const html = renderToStaticMarkup(
      createElement(InsightsPartnerDemoAction, {
        lastUploadedFileName: "Groww_batch_02",
      }),
    );
    expect(html).toContain("Run Partner Demo");
    expect(html).toContain("btn-secondary rounded-[var(--radius-panel)]");
    expect(html).toContain("!h-9");
    expect(html).toContain("!px-3.5");
  });

  it("does not treat Groww or weekly Zerodha uploads as the Partner Demo pack", () => {
    expect(vaultShowcaseAlreadyActive("partner", "Groww_batch_02")).toBe(false);
    expect(
      vaultShowcaseAlreadyActive("partner", "Zerodha_week_5_batch_02.json"),
    ).toBe(false);
    expect(
      vaultShowcaseAlreadyActive("partner", ZERODHA_BATCH02_SAMPLE_NAME),
    ).toBe(true);
  });

  it("shares Vault / Upload Partner Demo identity (Zerodha_batch_02 + partner_demo)", () => {
    expect(vaultShowcaseDisplayName("partner")).toBe(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vaultShowcaseStoreAction("partner")).toBe("partner_demo");
  });
});
