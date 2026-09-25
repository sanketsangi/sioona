/**
 * Fill Neon feedback holes after prediction dual-write.
 * Inserts only (`if_absent`) so a stale JSON label cannot overwrite Neon.
 * Sends the JSON `reviewedAt` so the week window stays on the original review.
 */

import { submitFeedback } from "./backend-client";
import type { FeedbackLabel, Signal } from "./types";

const CANONICAL_LABELS = new Set<FeedbackLabel>([
  "correct",
  "incorrect",
  "partially_correct",
]);

const REPLAY_CONCURRENCY = 6;
const REPLAY_REVIEWER = "shadow_reviewer";

export type FeedbackReplayStats = {
  attempted: number;
  failed: number;
};

/** Signals that already have a Neon id and a canonical JSON review. */
export function feedbackReplayCandidates(signals: Signal[]): Signal[] {
  return signals.filter((signal) => {
    const predictionId = signal.backendSignalId?.trim();
    const label = signal.feedback?.label;
    return Boolean(predictionId) && label != null && CANONICAL_LABELS.has(label);
  });
}

function reviewedAtIso(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** Best-effort. One failed row does not stop the rest. */
export async function replayAbsentFeedback(
  tenantId: string,
  signals: Signal[]
): Promise<FeedbackReplayStats> {
  const rows = feedbackReplayCandidates(signals);
  let failed = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < rows.length) {
      const signal = rows[next];
      next += 1;
      const feedback = signal?.feedback;
      const predictionId = signal?.backendSignalId?.trim();
      if (!signal || !feedback || !predictionId) continue;
      try {
        await submitFeedback(tenantId, predictionId, {
          feedback: feedback.label,
          reviewed_by: REPLAY_REVIEWER,
          note: feedback.note,
          reviewed_at: reviewedAtIso(feedback.reviewedAt),
          if_absent: true,
        });
      } catch (err) {
        failed += 1;
        const detail = err instanceof Error ? err.message : "unknown error";
        console.warn(
          `[replay-absent-feedback] tenant=${tenantId} signal=${signal.id}: ${detail}`
        );
      }
    }
  }

  const workerCount = Math.min(Math.max(rows.length, 0), REPLAY_CONCURRENCY);
  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }
  return { attempted: rows.length, failed };
}
