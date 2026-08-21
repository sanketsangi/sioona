/** Rotating tips under Upload while ingest / Partner Demo / Reset is busy. */

export const UPLOAD_TIP_INTERVAL_MS = 4500;

export const UPLOAD_TIPS = [
  "Heuristics run first — a typical export finishes in about a minute.",
  "New signals land in Insights pending for Correct / Incorrect review.",
  "Partner Demo wipes Neon, then seeds Zerodha chats — usually under a minute.",
  "Shadow Mode scores only — nothing sends to customers.",
  "After detect, clear Needs Review so Eval’s week window has reviews to score.",
  "Reset Demo Data restores Groww Day-1 samples in a few seconds.",
] as const;

export type UploadTip = (typeof UPLOAD_TIPS)[number];

export function nextUploadTipIndex(current: number, length = UPLOAD_TIPS.length): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}
