/**
 * One automatic wake + refresh when Insights/Eval miss FastAPI
 * (Render free-tier sleep). Cooldown prevents a refresh loop.
 */

export const BACKEND_HEALTH_PATH = "/api/backend-health";
export const BACKEND_WAKE_STORAGE_KEY = "sio-backend-wake-at";
export const BACKEND_WAKE_COOLDOWN_MS = 60_000;

export const QUEUE_UNAVAILABLE_PANEL_TITLE = "Review Queue Unavailable";
export const QUEUE_UNAVAILABLE_PANEL_BODY =
  "The review queue is still loading. Retry in a moment.";

export const FOLLOWUP_UNAVAILABLE_PANEL_TITLE = "Follow-Up Queue Unavailable";
export const FOLLOWUP_UNAVAILABLE_PANEL_BODY =
  "Follow-up is still loading. Retry in a moment.";

/** Score service asleep — keep last queue counts; one Retry. */
export const SCORE_WAITING_TITLE = "Weekly Score Waiting";
export const SCORE_WAITING_LINE = "The weekly score is waiting.";
export const SCORE_WAITING_BODY =
  "The weekly score is waiting. Retry in a moment.";
export const SCORE_WAITING_RETRY = "Retry";

type WakeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function shouldWakeBackendFromNotifications(
  notifications: Array<{ id: string }>
): boolean {
  return notifications.some(
    (item) => item.id === "queue-unavailable" || item.id === "score-unavailable"
  );
}

export function shouldAttemptBackendWake(
  storage: Pick<Storage, "getItem">,
  now: number
): boolean {
  const raw = storage.getItem(BACKEND_WAKE_STORAGE_KEY);
  if (!raw) return true;
  const attemptedAt = Number(raw);
  if (!Number.isFinite(attemptedAt)) return true;
  return now - attemptedAt >= BACKEND_WAKE_COOLDOWN_MS;
}

export function markBackendWakeAttempted(
  storage: Pick<Storage, "setItem">,
  now: number
): void {
  storage.setItem(BACKEND_WAKE_STORAGE_KEY, String(now));
}

export function clearBackendWakeAttempt(
  storage: Pick<Storage, "removeItem">
): void {
  storage.removeItem(BACKEND_WAKE_STORAGE_KEY);
}

export async function wakeBackendAndRefresh(opts: {
  storage: WakeStorage;
  now: number;
  fetchHealth: () => Promise<unknown>;
  refresh: () => void;
}): Promise<"skipped" | "refreshed"> {
  if (!shouldAttemptBackendWake(opts.storage, opts.now)) {
    return "skipped";
  }
  markBackendWakeAttempted(opts.storage, opts.now);
  try {
    await opts.fetchHealth();
  } catch {
    // Fail-soft: Render may still be up after a timed-out wake ping.
  }
  opts.refresh();
  return "refreshed";
}
