/** Default Eval/Insights SignalScore window: last 7 days of feedback.reviewed_at (UTC). */
export const SIGNAL_SCORE_WINDOW_DAYS = 7;

export type SignalScoreWindowStatus = "default" | "custom" | "invalid";

export interface SignalScoreWindow {
  status: SignalScoreWindowStatus;
  /** ISO UTC `date_from` sent to FastAPI. */
  resolvedFrom: string;
  /** `YYYY-MM-DD` for the scoreFrom picker / `?scoreFrom=` query. */
  dateInput: string;
  /** Short chrome label (This week vs From …). */
  label: string;
}

const UTC_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Resolve `date_from` for SignalScore (ISO UTC).
 * Precedence: `scoreFrom` query → `SIGNAL_SCORE_FROM` env → now − 7 days.
 */
export function resolveSignalScoreDateFrom(opts?: {
  scoreFrom?: string | null;
  envFrom?: string | null;
  now?: Date;
}): string {
  return inspectSignalScoreWindow(opts).resolvedFrom;
}

/** Query-driven window for Eval chrome. Env override still affects `resolvedFrom`. */
export function inspectSignalScoreWindow(opts?: {
  scoreFrom?: string | null;
  envFrom?: string | null;
  now?: Date;
}): SignalScoreWindow {
  const queryRaw = (opts?.scoreFrom ?? "").trim();
  const envRaw = (opts?.envFrom ?? "").trim();
  const now = opts?.now ?? new Date();
  const fallback = defaultWindowStart(now);

  if (queryRaw) {
    const parsed = parseScoreFromInstant(queryRaw);
    if (!parsed) {
      return {
        status: "invalid",
        resolvedFrom: fallback,
        dateInput: fallback.slice(0, 10),
        label: `Last ${SIGNAL_SCORE_WINDOW_DAYS} days`,
      };
    }
    const iso = parsed.toISOString();
    return {
      status: "custom",
      resolvedFrom: iso,
      dateInput: iso.slice(0, 10),
      label: `From ${UTC_DAY.format(parsed)}`,
    };
  }

  if (envRaw) {
    const parsed = parseScoreFromInstant(envRaw);
    if (parsed) {
      const iso = parsed.toISOString();
      return {
        status: "custom",
        resolvedFrom: iso,
        dateInput: iso.slice(0, 10),
        label: `From ${UTC_DAY.format(parsed)}`,
      };
    }
  }

  return {
    status: "default",
    resolvedFrom: fallback,
    dateInput: fallback.slice(0, 10),
    label: `Last ${SIGNAL_SCORE_WINDOW_DAYS} days`,
  };
}

function defaultWindowStart(now: Date): string {
  return new Date(
    now.getTime() - SIGNAL_SCORE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

/** Accept full ISO datetime or date-only (`YYYY-MM-DD` → UTC midnight). */
export function parseScoreFromInstant(raw: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(dt.getTime()) || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Inclusive upper bound; date-only means the complete UTC day. */
export function inspectSignalScoreEnd(raw: string | null | undefined, from: string): {
  dateTo?: string; error?: string;
} {
  if (!raw?.trim()) return {};
  const parsed = parseScoreFromInstant(raw.trim());
  if (!parsed) return { error: "Invalid report end date" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) parsed.setUTCHours(23, 59, 59, 999);
  if (parsed.getTime() < Date.parse(from)) return { error: "Report end date precedes its start" };
  return { dateTo: parsed.toISOString() };
}
