/** Rotating tips under Upload while ingest / Partner Demo / Reset is busy. */

export const UPLOAD_TIP_INTERVAL_MS = 4500;

export const UPLOAD_TIPS = [
  "A typical export finishes in about a minute.",
  "New chats land in Insights. Mark the ones we got right.",
  "Review five chats this week. The weekly score is on Eval.",
  "Nothing is sent. You follow up in your own tools.",
  "Upload next week’s export when you have it. Matching chats update.",
] as const;

export type UploadTip = (typeof UPLOAD_TIPS)[number];

export function nextUploadTipIndex(current: number, length = UPLOAD_TIPS.length): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}
