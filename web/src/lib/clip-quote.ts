/** Why This Fired / evidence quotes — one unicode ellipsis when truncating. */
export const QUOTE_MAX = 140;

export function clipQuote(text: string, max = QUOTE_MAX): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}
