/**
 * Basename of the last partner upload (`File.name` from ingest / Upload).
 * Empty or whitespace-only names are omitted — never invent a label.
 */
export function lastUploadedFileName(
  fileName: string | null | undefined
): string | undefined {
  if (fileName == null) return undefined;
  const trimmed = fileName.trim();
  if (!trimmed) return undefined;
  const base = trimmed.split(/[/\\]/).pop()?.trim();
  return base || undefined;
}
