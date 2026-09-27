/**
 * Client helper: seed a Vault showcase pack then land Insights.
 * Used by AppSidebar so Sample ↔ Partner Demo switches never navigate into
 * VaultShowcaseLoader mismatch chrome (wipe completes first).
 */
import { llmQueryExtras } from "@/lib/detect-llm-query";
import {
  consumePartnerDemoNdjson,
  PARTNER_DEMO_NDJSON_CONTENT_TYPE,
} from "@/lib/partner-demo-progress";
import { syncQueryExtras } from "@/lib/prediction-sync";
import {
  vaultShowcaseFailedMessage,
  vaultShowcaseInsightsHref,
  vaultShowcaseNavigateOnly,
  vaultShowcaseStoreAction,
  type VaultShowcaseKind,
} from "@/lib/vault-showcase";

export type SeedVaultShowcaseResult =
  | { ok: true; href: string; skippedWipe: true }
  | { ok: true; href: string; skippedWipe: false }
  | { ok: false; error: string };

/**
 * If keep-set already matches, returns Insights href with no POST.
 * Otherwise wipe+seeds via store NDJSON and returns a `replaced=1` href.
 */
export async function seedVaultShowcaseForNavigation(
  kind: VaultShowcaseKind,
  lastUploadedFileName: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SeedVaultShowcaseResult> {
  if (vaultShowcaseNavigateOnly(kind, lastUploadedFileName)) {
    return {
      ok: true,
      href: vaultShowcaseInsightsHref(kind),
      skippedWipe: true,
    };
  }

  const failedMessage = vaultShowcaseFailedMessage(kind);
  // Wake sleeping Render while wipe starts (fail-soft).
  void fetchImpl("/api/backend-health").catch(() => undefined);

  try {
    const res = await fetchImpl("/api/store", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: PARTNER_DEMO_NDJSON_CONTENT_TYPE,
      },
      body: JSON.stringify({ action: vaultShowcaseStoreAction(kind) }),
    });
    const data = await consumePartnerDemoNdjson(res, { failedMessage });
    const sync = syncQueryExtras(data.predictionSync);
    const llm = llmQueryExtras(data.detectLlm);
    return {
      ok: true,
      href: vaultShowcaseInsightsHref(kind, {
        replaced: true,
        syncFailed: sync.syncFailed,
        syncCreated: sync.syncCreated,
        llmAdded: llm.llmAdded,
        llmFailed: llm.llmFailed,
        llmFailure: llm.llmFailure,
        wipeFailed: data.wipeFailed,
      }),
      skippedWipe: false,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : failedMessage,
    };
  }
}
