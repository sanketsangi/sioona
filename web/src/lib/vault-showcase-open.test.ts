import { describe, expect, it, vi } from "vitest";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import { PARTNER_DEMO_NDJSON_CONTENT_TYPE } from "@/lib/partner-demo-progress";
import { seedVaultShowcaseForNavigation } from "./vault-showcase-open";

describe("seedVaultShowcaseForNavigation", () => {
  it("skips wipe when Sample is already the keep-set", async () => {
    const fetchImpl = vi.fn();
    const result = await seedVaultShowcaseForNavigation(
      "sample",
      GROWW_SHOWCASE_SAMPLE_NAME,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({
      ok: true,
      href: `/?view=insights&file=${encodeURIComponent(GROWW_SHOWCASE_SAMPLE_NAME)}`,
      skippedWipe: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips wipe when Partner Demo is already the keep-set", async () => {
    const fetchImpl = vi.fn();
    const result = await seedVaultShowcaseForNavigation(
      "partner",
      ZERODHA_BATCH02_SAMPLE_NAME,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skippedWipe).toBe(true);
      expect(result.href).toContain("demo=1");
      expect(result.href).toContain(encodeURIComponent(ZERODHA_BATCH02_SAMPLE_NAME));
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs wipe+seed then lands with replaced=1 when keep-set differs", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("backend-health")) {
        return new Response("{}", { status: 200 });
      }
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Accept: PARTNER_DEMO_NDJSON_CONTENT_TYPE,
      });
      const body = JSON.parse(String(init?.body));
      expect(body.action).toBe("partner_demo");
      const lines = [
        JSON.stringify({ type: "progress", step: "wipe", done: 1, total: 1 }),
        JSON.stringify({
          type: "complete",
          importedConversations: 2,
          newSignals: 3,
          samples: [ZERODHA_BATCH02_SAMPLE_NAME],
          predictionSync: {
            attempted: 0,
            created: 0,
            updated: 0,
            failed: 0,
            skipped: 0,
          },
          conversationSync: {
            attempted: 0,
            created: 0,
            updated: 0,
            failed: 0,
            skipped: 0,
            messagesCreated: 0,
            messagesUpdated: 0,
          },
          detectLlm: {
            enabled: false,
            candidates: 0,
            attempted: 0,
            added: 0,
            failed: 0,
            skipped: 0,
          },
        }),
      ];
      return new Response(`${lines.join("\n")}\n`, {
        status: 200,
        headers: { "Content-Type": PARTNER_DEMO_NDJSON_CONTENT_TYPE },
      });
    });

    const result = await seedVaultShowcaseForNavigation(
      "partner",
      GROWW_SHOWCASE_SAMPLE_NAME,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skippedWipe).toBe(false);
      expect(result.href).toContain("replaced=1");
      expect(result.href).toContain("demo=1");
    }
    expect(fetchImpl).toHaveBeenCalled();
  });
});
