import { lastUploadedFileName } from "@/lib/upload-filename";

/** Synthetic-Data Week-4 Batch-02 — held-out; ingest only after explicit confirm. */
export const WEEK4_BATCH02_HELD_OUT_BASENAME = "Zerodha_week_4_batch_02.json";

/** Stable API/UI code when the held-out weekly pack is uploaded without confirm. */
export const HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE =
  "held_out_weekly_ingest_confirm_required" as const;

export const HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE =
  "Week-4 Batch-02 is held out for measurement. Uploading it will add those chats to the live tenant. Confirm Ingest to continue, or Cancel and use the next unused weekly dump.";

/** Form field accepted by POST /api/ingest after the user confirms held-out ingest. */
export const CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD =
  "confirm_held_out_weekly_ingest" as const;

const WEEK1_CSV = "real-partner-export.local.csv";
const WEEK_N_CSV = /^real-partner-export\.week\d+\.local\.csv$/;
const WEEKLY_JSON = /^[a-z][a-z0-9]*_week_\d+_batch_\d+\.json$/;
const HELD_OUT_LOWER = WEEK4_BATCH02_HELD_OUT_BASENAME.toLowerCase();

function normalizedBasename(name?: string | null): string | undefined {
  const base = lastUploadedFileName(name);
  return base ? base.toLowerCase() : undefined;
}

/**
 * Weekly partner drop-ins: Day-1 replace, mid-week upsert when Neon count > 0.
 * Other filenames merge into an existing real upload so Uploaded Chats keeps
 * every file. They still replace Sample, Partner Demo, and an empty keep-set.
 */
export function isPartnerWeeklyPackBasename(
  name?: string | null
): boolean {
  const base = normalizedBasename(name);
  if (!base) return false;
  if (base === WEEK1_CSV) return true;
  if (WEEK_N_CSV.test(base)) return true;
  return WEEKLY_JSON.test(base);
}

export function isHeldOutWeeklyPackBasename(
  name?: string | null
): boolean {
  return normalizedBasename(name) === HELD_OUT_LOWER;
}

/**
 * True for Week-4 Batch-02 regardless of replace vs upsert.
 * Confirmed ingest still follows the weekly-pack replaceShowcase rules.
 */
export function requiresHeldOutWeeklyIngestConfirm(options: {
  uploadedBasename?: string | null;
  confirmed: boolean;
}): boolean {
  if (options.confirmed) return false;
  return isHeldOutWeeklyPackBasename(options.uploadedBasename);
}

export function parseConfirmHeldOutWeeklyIngest(form: FormData): boolean {
  const value = form.get(CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD);
  return value === "true" || value === "1";
}
