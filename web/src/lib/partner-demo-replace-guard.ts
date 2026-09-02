/** Cold-open / Reset Demo chrome name for Groww testing.json. */
export const GROWW_SHOWCASE_SAMPLE_NAME = "Groww_batch_02";

/** Last-upload breadcrumb when Run Partner Demo seeded Zerodha Batch-02. */
export const ZERODHA_BATCH02_SAMPLE_NAME = "Zerodha_batch_02";

/** True when last-upload chrome name is this sample, with or without an extension. */
export function matchesVaultSampleName(
  lastUploadedFileName: string | null | undefined,
  sampleName: string
): boolean {
  const trimmed = lastUploadedFileName?.trim();
  if (!trimmed) return false;
  if (trimmed === sampleName) return true;
  const stem = trimmed.replace(/\.[^.]+$/, "");
  return stem === sampleName;
}

/** Stable API/UI code when Partner Demo Zerodha would be replaced without confirm. */
export const PARTNER_DEMO_REPLACE_CONFIRM_CODE =
  "partner_demo_replace_confirm_required" as const;

export const PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE =
  "Partner Demo (Zerodha) is the active keep-set. Uploading this file will replace those chats and wipe the review window. Confirm Replace to continue, or Cancel and keep reviewing on Insights.";

/** Form field accepted by POST /api/ingest after the user confirms overwrite. */
export const CONFIRM_PARTNER_DEMO_REPLACE_FIELD =
  "confirm_partner_demo_replace" as const;

/**
 * True when the last load was Run Partner Demo (Zerodha Batch-02), so a
 * full-replace upload would wipe the active keep-set window.
 */
export function isPartnerDemoKeepSetActive(
  lastUploadedFileName?: string | null
): boolean {
  if (lastUploadedFileName == null) return false;
  return lastUploadedFileName.trim() === ZERODHA_BATCH02_SAMPLE_NAME;
}

export function requiresPartnerDemoReplaceConfirm(options: {
  lastUploadedFileName?: string | null;
  willReplace: boolean;
  confirmed: boolean;
}): boolean {
  if (!options.willReplace || options.confirmed) return false;
  return isPartnerDemoKeepSetActive(options.lastUploadedFileName);
}

export function parseConfirmPartnerDemoReplace(form: FormData): boolean {
  const value = form.get(CONFIRM_PARTNER_DEMO_REPLACE_FIELD);
  return value === "true" || value === "1";
}
