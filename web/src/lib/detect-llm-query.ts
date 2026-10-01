/**
 * URL + API helpers for Detect v2 pass-2 stats (`detectLlm` on detect/ingest/demo).
 */

import {
  DETECT_LLM_MAX_CALLS,
  detectLlmMaxCalls,
  type LlmFailureKind,
  type LlmPassStats,
} from "./detect-llm";

export type { LlmFailureKind, LlmPassStats };

const LLM_FAILURE_KINDS = new Set<LlmFailureKind>([
  "key",
  "model",
  "timeout",
  "shape",
]);

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
  const rawFailure = o.llmFailure ?? o.failure;
  const llmFailure =
    typeof rawFailure === "string" &&
    LLM_FAILURE_KINDS.has(rawFailure as LlmFailureKind)
      ? (rawFailure as LlmFailureKind)
      : undefined;
  return {
    enabled,
    candidates: Math.max(0, Math.floor(candidates)),
    attempted: Math.max(0, Math.floor(attempted)),
    added: Math.max(0, Math.floor(added)),
    failed: Math.max(0, Math.floor(failed)),
    skipped: Math.max(0, Math.floor(skipped)),
    ...(llmFailure && Math.floor(failed) > 0 ? { llmFailure } : {}),
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

export function parseLlmFailureParam(
  raw?: string | null
): LlmFailureKind | null {
  if (raw && LLM_FAILURE_KINDS.has(raw as LlmFailureKind)) {
    return raw as LlmFailureKind;
  }
  return null;
}

/** Landing copy for a failed Groq pass. Heuristic signal count stays in the sentence. */
export function llmPassFailureNotice(input: {
  failed: number;
  failure: LlmFailureKind | null;
  signalCount: number | null;
  /** False while the uploaded file is not on screen yet. */
  inQueue?: boolean;
}): { title: string; description: string } {
  const calls = `${input.failed} second-pass call${input.failed === 1 ? "" : "s"} failed`;
  const cause =
    input.failure === "model"
      ? "Groq no longer serves this model."
      : input.failure === "key"
        ? "Groq rejected the key."
        : input.failure === "timeout"
          ? "The second pass timed out."
          : input.failure === "shape"
            ? "Groq’s reply could not be read."
            : "The second pass failed.";
  const count =
    input.signalCount != null && input.signalCount > 0
      ? input.signalCount
      : null;
  const kept =
    input.inQueue === false
      ? count != null
        ? ` ${count} signal${count === 1 ? "" : "s"} from the first pass ${count === 1 ? "is" : "are"} saved. ${count === 1 ? "It shows up" : "They show up"} when this export finishes opening.`
        : " Signals from the first pass show up when this export finishes opening."
      : count != null
        ? ` ${count} signal${count === 1 ? "" : "s"} from the first pass ${count === 1 ? "is" : "are"} still in the queue.`
        : " Signals from the first pass stay in the queue.";
  return {
    title: "Second pass failed",
    description: `${cause} ${calls}.${kept}`,
  };
}

/** Landing copy when a dump left zero-signal chats for the next re-detect. */
export function llmSkipResumeNotice(
  remaining: number,
  maxCalls = detectLlmMaxCalls()
): { title: string; description: string } | null {
  if (!Number.isFinite(remaining) || remaining < 1) return null;
  const left = Math.floor(remaining);
  const cap =
    Number.isFinite(maxCalls) && maxCalls > 0
      ? Math.floor(maxCalls)
      : DETECT_LLM_MAX_CALLS;
  const next = Math.min(cap, left);
  const chats = `${left} chat${left === 1 ? "" : "s"}`;
  const follow =
    next === left
      ? `Re-run Detection classifies ${left === 1 ? "that chat" : "those chats"} next.`
      : `Re-run Detection classifies the next ${next}.`;
  return {
    title: "Second pass has more chats",
    description: `${chats} ${left === 1 ? "was" : "were"} not classified. ${follow}`,
  };
}

/** Query extras after detect/demo. Empty when pass 2 was off or unused. */
export function llmQueryExtras(
  stats: LlmPassStats | null | undefined
): Record<string, string | null> {
  if (!stats?.enabled || stats.attempted <= 0) {
    return { llmAdded: null, llmFailed: null, llmFailure: null };
  }
  return {
    llmAdded: stats.added > 0 ? String(stats.added) : null,
    llmFailed: stats.failed > 0 ? String(stats.failed) : null,
    llmFailure:
      stats.failed > 0 && stats.llmFailure ? stats.llmFailure : null,
  };
}
