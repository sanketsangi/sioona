/** Validate mapping counts before showing a preview as usable. */
export function uploadPreviewDetail(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Mapping preview is unavailable. Your file remains selected; retry Preview mapping.");
  const row = value as Record<string, unknown>;
  const count = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!count(row.conversations) || !count(row.messages) || typeof row.mapping !== "string" || !row.mapping.trim() || typeof row.missingTimestampPolicy !== "string") {
    throw new Error("Mapping preview is invalid. Your file remains selected; retry Preview mapping.");
  }
  return `${Intl.NumberFormat().format(row.conversations as number)} conversations, ${Intl.NumberFormat().format(row.messages as number)} messages. ${row.mapping} ${row.missingTimestampPolicy} Nothing imported; choose Upload & Detect to continue.`;
}
