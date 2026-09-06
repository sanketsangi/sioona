/**
 * Vault → Insights file scope (`?file=`).
 * Keep-set identity is still `pilot.lastUploadedFileName` (single store);
 * URL `file` selects which vault row is active and gates the queue.
 */
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  matchesVaultSampleName,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import { viewHref } from "@/lib/views";

export { GROWW_SHOWCASE_SAMPLE_NAME, ZERODHA_BATCH02_SAMPLE_NAME };

/** Trimmed `?file=` value, or null when omitted / blank. */
export function parseVaultFile(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Insights vault scope: explicit `?file=` wins; bare Insights defaults to Sample
 * so app start / Workspace Insights land on Groww_batch_02 (auto-load on mismatch).
 */
export function resolveInsightsVaultFile(
  raw?: string | null,
): string {
  return parseVaultFile(raw) ?? GROWW_SHOWCASE_SAMPLE_NAME;
}

/** Insights deep-link scoped to a vault catalog filename. */
export function vaultInsightsHref(
  fileName: string,
  extras?: Record<string, string | undefined | null>,
): string {
  return viewHref("insights", {
    ...extras,
    file: fileName,
  });
}

/** Default Insights entry (Sample) — brand / Workspace Insights. */
export function defaultInsightsHref(
  extras?: Record<string, string | undefined | null>,
): string {
  return vaultInsightsHref(GROWW_SHOWCASE_SAMPLE_NAME, extras);
}

/**
 * True when this vault row is the active keep-set (`lastUploadedFileName`),
 * including Sample names with or without an extension.
 */
export function vaultFileMatchesKeepSet(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
): boolean {
  const file = vaultFile?.trim();
  const last = lastUploadedFileName?.trim();
  if (!file || !last) return false;
  if (last === file) return true;
  // Sample chrome: Groww_batch_02 ↔ Groww_batch_02.csv
  if (matchesVaultSampleName(last, file)) return true;
  if (matchesVaultSampleName(file, last)) return true;
  const fileStem = file.replace(/\.[^.]+$/, "");
  const lastStem = last.replace(/\.[^.]+$/, "");
  return fileStem === lastStem;
}

/**
 * Header breadcrumb: selected vault file wins so chrome matches the
 * sidebar pill while a showcase pack is still loading.
 */
export function resolveHeaderBatchName(opts: {
  vaultFile?: string | null;
  lastUploadedFileName?: string | null;
}): string | undefined {
  const fromUrl = parseVaultFile(opts.vaultFile);
  if (fromUrl) return fromUrl;
  const last = opts.lastUploadedFileName?.trim();
  return last || undefined;
}

/**
 * True when Insights/Eval can render the selected vault's keep-set
 * (not a showcase loader / mismatch empty). Ready notifications use this.
 */
export function isVaultBatchRenderable(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
): boolean {
  const file = parseVaultFile(vaultFile);
  if (!file) return true;
  return vaultFileMatchesKeepSet(file, lastUploadedFileName);
}

/** Which vault row should show the active pill. */
export function resolveVaultActiveFile(opts: {
  /** `?file=` when present — wins over keep-set breadcrumb. */
  vaultFile?: string | null;
  lastUploadedFileName?: string | null;
}): string | null {
  const fromUrl = parseVaultFile(opts.vaultFile);
  if (fromUrl) return fromUrl;
  const last = opts.lastUploadedFileName?.trim();
  // Empty keep-set (cold / wiped) — Sample is the default Insights file.
  return last || GROWW_SHOWCASE_SAMPLE_NAME;
}

export type VaultFileEmptyNext = {
  title: string;
  description: string;
  href: string;
  label: string;
};

/**
 * Empty / mismatch next step when Insights is scoped to a vault file that
 * is not the loaded keep-set. Does not wipe or hydrate — points at Upload.
 */
export function vaultFileEmptyNext(
  vaultFile: string,
): VaultFileEmptyNext {
  if (matchesVaultSampleName(vaultFile, GROWW_SHOWCASE_SAMPLE_NAME)) {
    return {
      title: "Sample Not Loaded",
      description:
        "Groww_batch_02 is not the active keep-set. Reset Demo on Upload to load this sample, then review on Insights.",
      href: viewHref("upload"),
      label: "Open Upload",
    };
  }
  if (matchesVaultSampleName(vaultFile, ZERODHA_BATCH02_SAMPLE_NAME)) {
    return {
      title: "Partner Demo Not Loaded",
      description:
        "Zerodha_batch_02 is not the active keep-set. Run Partner Demo on Upload to load it, then review on Insights.",
      href: viewHref("upload"),
      label: "Open Upload",
    };
  }
  return {
    title: "File Not Loaded",
    description: `${vaultFile} is not the active keep-set. Upload that export on Uploaded Chats, or open the active file from Vault.`,
    href: viewHref("upload"),
    label: "Uploaded Chats",
  };
}
