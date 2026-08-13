/**
 * URL + API helpers for Detect v2 pass-2 stats (`detectLlm` on detect/ingest/demo).
 */

import type { LlmPassStats } from "./detect-llm";

export type { LlmPassStats };

export function parseLlmPassStats(raw: unknown): LlmPassStats | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true;
  const candidates = Number(o.candidates);
  const attempted = Number(o.attempted);
  const added = Number(o.added);
  const failed = Number(o.failed);
  const skipped = Number(o.skipped);
  if (
    ![candidates, attempted, added, failed, skipped].every((n) =>
      Number.isFinite(n)
    )
  ) {
    return null;
  }
  return {
    enabled,
    candidates: Math.max(0, Math.floor(candidates)),
    attempted: Math.max(0, Math.floor(attempted)),
    added: Math.max(0, Math.floor(added)),
    failed: Math.max(0, Math.floor(failed)),
    skipped: Math.max(0, Math.floor(skipped)),
  };
}

export function parseLlmAddedParam(raw?: string | null): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n);
}

export function parseLlmFailedParam(raw?: string | null): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n);
}

/** Query extras after detect/demo. Empty when pass 2 was off or unused. */
export function llmQueryExtras(
  stats: LlmPassStats | null | undefined
): Record<string, string | null> {
  if (!stats?.enabled || stats.attempted <= 0) {
    return { llmAdded: null, llmFailed: null };
  }
  return {
    llmAdded: stats.added > 0 ? String(stats.added) : null,
    llmFailed: stats.failed > 0 ? String(stats.failed) : null,
  };
}
