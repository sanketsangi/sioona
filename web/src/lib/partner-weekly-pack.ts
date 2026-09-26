import { lastUploadedFileName } from "@/lib/upload-filename";
import { isLivePartnerKeepSet } from "@/lib/vault-file";

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

/** Shown on Upload before ingest when this request drops the current chats. */
export const INGEST_REPLACES_CURRENT_CHATS =
  "This file replaces the current chats.";

/** Shown on Upload before ingest when matching chats update and others stay. */
export const INGEST_UPDATES_MATCHING_CHATS =
  "This file updates matching chats and keeps the rest.";

/**
 * POST /api/ingest replaceShowcase.
 * Weekly packs replace on an explicit flag or the first export (count 0);
 * later weeks update matches and keep the rest.
 * Other filenames replace on an explicit flag, or when the loaded file is
 * Sample, Partner Demo, or empty. A live upload otherwise keeps chats
 * that are not in this file.
 */
export function replaceShowcaseOnIngest(options: {
  uploadedBasename?: string | null;
  explicitReplace: boolean;
  priorWeeklyExportCount?: number | null;
  lastUploadedFileName?: string | null;
}): boolean {
  const priorExports = options.priorWeeklyExportCount ?? 0;
  if (isPartnerWeeklyPackBasename(options.uploadedBasename)) {
    return options.explicitReplace || priorExports === 0;
  }
  return (
    options.explicitReplace ||
    !isLivePartnerKeepSet(options.lastUploadedFileName)
  );
}

/** Sentence Upload shows for the ingest outcome of this file. */
export function ingestCatalogOutcomeMessage(options: {
  uploadedBasename?: string | null;
  explicitReplace: boolean;
  priorWeeklyExportCount?: number | null;
  lastUploadedFileName?: string | null;
}): string {
  return replaceShowcaseOnIngest(options)
    ? INGEST_REPLACES_CURRENT_CHATS
    : INGEST_UPDATES_MATCHING_CHATS;
}
