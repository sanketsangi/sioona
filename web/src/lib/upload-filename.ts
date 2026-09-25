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

/** Case-folded key so `Batch.json` and `batch.json` count as the same upload name. */
export function catalogFileKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Vault label for one upload. The first copy keeps `fileName`.
 * A later copy with the same name becomes `file (2).ext`, then `file (3).ext`.
 * `taken` holds `catalogFileKey` values already reserved.
 */
export function uniqueCatalogBasename(
  fileName: string | null | undefined,
  taken: ReadonlySet<string>,
): string | undefined {
  const base = lastUploadedFileName(fileName);
  if (!base) return undefined;
  if (!taken.has(catalogFileKey(base))) return base;
  const dot = base.lastIndexOf(".");
  const hasExt = dot > 0;
  const stem = hasExt ? base.slice(0, dot) : base;
  const ext = hasExt ? base.slice(dot) : "";
  let n = 2;
  let candidate = `${stem} (${n})${ext}`;
  while (taken.has(catalogFileKey(candidate))) {
    n += 1;
    candidate = `${stem} (${n})${ext}`;
  }
  return candidate;
}

/** Reserve `fileName` in `taken` and return the catalog label that was claimed. */
export function claimCatalogBasename(
  fileName: string | null | undefined,
  taken: Set<string>,
): string | undefined {
  const unique = uniqueCatalogBasename(fileName, taken);
  if (unique) taken.add(catalogFileKey(unique));
  return unique;
}
