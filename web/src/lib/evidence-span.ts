/** Highlight only offsets that reconstruct the persisted quote exactly.
 * Python producers may count Unicode code points; browsers count UTF-16 units.
 * Both representations are accepted only after exact substring verification.
 */
export function verifiedEvidenceSpan(text: string, span?: { start: number; end: number; quote?: string | null }): { start: number; end: number } | null {
  if (!span?.quote || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start) return null;
  if (span.end <= text.length && text.slice(span.start, span.end) === span.quote) return { start: span.start, end: span.end };
  const points = Array.from(text);
  if (span.end > points.length || points.slice(span.start, span.end).join("") !== span.quote) return null;
  return { start: points.slice(0, span.start).join("").length, end: points.slice(0, span.end).join("").length };
}
