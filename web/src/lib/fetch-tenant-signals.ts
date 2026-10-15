import { conversationScopes } from "./conversation-scopes";
/**
 * Fetch tenant predictions (feedback + Acted) from FastAPI.
 * Returns explicit ok/error — never a silent empty list on failure.
 */

import {
  BackendClientError,
  getTenantSignalsPage,
  type BackendPredictionWithFeedback,
} from "./backend-client";

export type TenantSignalsResult =
  | { ok: true; rows: BackendPredictionWithFeedback[] }
  | { ok: false; error: string };

export async function fetchTenantSignals(
  tenantId: string,
  opts?: {
    /** Active JSON keep-set. Empty array → no rows. Omit for hydrate / wipe. */
    conversationIds?: string[];
    q?: string;
  }
): Promise<TenantSignalsResult> {
  if (
    opts?.conversationIds !== undefined &&
    opts.conversationIds.every((id) => id.length === 0)
  ) {
    return { ok: true, rows: [] };
  }
  try {
    const rows: BackendPredictionWithFeedback[] = [];
    let pages = 0;
    for (const scope of conversationScopes(opts?.conversationIds)) {
      let after: string | undefined;
      const seen = new Set<string>();
      while (true) {
        if (pages++ >= 100) throw new Error("Tenant signals exceed the page budget; narrow the conversation scope.");
        const batch = await getTenantSignalsPage(tenantId, { limit: 100, after, conversationIds: scope, q: opts?.q });
        rows.push(...batch.predictions);
        if (!batch.next_cursor) break;
        if (seen.has(batch.next_cursor)) throw new Error("Tenant signals returned a repeated cursor.");
        seen.add(batch.next_cursor);
        after = batch.next_cursor;
      }
    }
    return { ok: true, rows };
  } catch (err) {
    const message =
      err instanceof BackendClientError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Signal Score backend unavailable";
    return { ok: false, error: message };
  }
}
