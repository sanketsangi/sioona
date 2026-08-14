/** Default Eval/Insights SignalScore window: last 7 days of feedback.reviewed_at (UTC). */
export const SIGNAL_SCORE_WINDOW_DAYS = 7;

/**
 * Resolve `date_from` for SignalScore (ISO UTC).
 * Precedence: `scoreFrom` query → `SIGNAL_SCORE_FROM` env → now − 7 days.
 */
export function resolveSignalScoreDateFrom(opts?: {
  scoreFrom?: string | null;
  envFrom?: string | null;
  now?: Date;
}): string {
  const raw = (opts?.scoreFrom ?? "").trim() || (opts?.envFrom ?? "").trim();
  if (raw) {
    const parsed = parseScoreFromInstant(raw);
    if (parsed) return parsed.toISOString();
  }
  const now = opts?.now ?? new Date();
  const from = new Date(
    now.getTime() - SIGNAL_SCORE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  return from.toISOString();
}

/** Accept full ISO datetime or date-only (`YYYY-MM-DD` → UTC midnight). */
function parseScoreFromInstant(raw: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
