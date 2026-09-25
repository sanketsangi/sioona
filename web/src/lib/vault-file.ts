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
import type { Conversation, Message } from "@/lib/types";
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
export function resolveInsightsVaultFile(raw?: string | null): string {
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
 * True when the loaded file is a partner export, not Sample or Partner Demo.
 * Serving Insights hides demo chrome on this path.
 */
export function isLivePartnerKeepSet(
  lastUploadedFileName?: string | null,
): boolean {
  const file = lastUploadedFileName?.trim();
  if (!file) return false;
  if (matchesVaultSampleName(file, GROWW_SHOWCASE_SAMPLE_NAME)) return false;
  if (matchesVaultSampleName(file, ZERODHA_BATCH02_SAMPLE_NAME)) return false;
  return true;
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

function isCatalogUploadName(name: string): boolean {
  if (matchesVaultSampleName(name, GROWW_SHOWCASE_SAMPLE_NAME)) return false;
  if (matchesVaultSampleName(name, ZERODHA_BATCH02_SAMPLE_NAME)) return false;
  return true;
}

/**
 * Uploaded Chats catalog. Stamped `sourceFile` values win, in first-seen
 * order. A legacy keep-set with no stamps still lists `lastUploadedFileName`.
 */
export function listUploadedChatFiles(
  conversations: readonly { sourceFile?: string }[],
  lastUploadedFileName?: string | null,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const conversation of conversations) {
    const name = conversation.sourceFile?.trim();
    if (!name || seen.has(name) || !isCatalogUploadName(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length > 0) return names;
  const last = lastUploadedFileName?.trim();
  if (last && isCatalogUploadName(last)) return [last];
  return [];
}

/** Index of `current` in the uploaded catalog, or -1. */
export function uploadedFileIndex(
  files: readonly string[],
  current: string | null | undefined,
): number {
  const file = current?.trim();
  if (!file) return -1;
  return files.findIndex(
    (name) => name === file || vaultFileMatchesKeepSet(file, name),
  );
}

/**
 * True when Insights can render this vault file: the keep-set itself, or
 * another file from the same multi-file export.
 */
export function vaultFileIsLoaded(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
  uploadedFileNames: readonly string[] = [],
): boolean {
  const file = parseVaultFile(vaultFile);
  if (!file) return true;
  if (vaultFileMatchesKeepSet(file, lastUploadedFileName)) return true;
  return uploadedFileIndex(uploadedFileNames, file) >= 0;
}

/**
 * True when Insights/Eval can render the selected vault's keep-set
 * (not a showcase loader / mismatch empty). Ready notifications use this.
 */
export function isVaultBatchRenderable(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
  uploadedFileNames: readonly string[] = [],
): boolean {
  return vaultFileIsLoaded(vaultFile, lastUploadedFileName, uploadedFileNames);
}

/**
 * When one export loaded several files, Insights shows the selected file's
 * chats. A single catalog entry leaves the store unfiltered.
 */
export function scopeChatsToUploadedFile<
  T extends { conversations: Conversation[]; messages: Message[] },
>(
  chats: T,
  vaultFile: string | null | undefined,
  uploadedFileNames: readonly string[],
): T {
  if (uploadedFileNames.length < 2) return chats;
  const file = parseVaultFile(vaultFile);
  if (!file) return chats;
  const index = uploadedFileIndex(uploadedFileNames, file);
  if (index < 0) return chats;
  const matched = uploadedFileNames[index];
  const fallback = uploadedFileNames[uploadedFileNames.length - 1];
  const conversations = chats.conversations.filter((conversation) => {
    const source = conversation.sourceFile?.trim();
    if (source) {
      return source === matched || vaultFileMatchesKeepSet(source, matched);
    }
    return matched === fallback;
  });
  const ids = new Set(conversations.map((conversation) => conversation.id));
  return {
    ...chats,
    conversations,
    messages: chats.messages.filter((message) =>
      ids.has(message.conversationId),
    ),
  };
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
export function vaultFileEmptyNext(vaultFile: string): VaultFileEmptyNext {
  if (matchesVaultSampleName(vaultFile, GROWW_SHOWCASE_SAMPLE_NAME)) {
    return {
      title: "Sample is not loaded",
      description: "Open Upload to load the sample, then review the chats.",
      href: viewHref("upload"),
      label: "Open Upload",
    };
  }
  if (matchesVaultSampleName(vaultFile, ZERODHA_BATCH02_SAMPLE_NAME)) {
    return {
      title: "Partner Demo is not loaded",
      description: "Open Upload to load Partner Demo, then review the chats.",
      href: viewHref("upload"),
      label: "Open Upload",
    };
  }
  return {
    title: "Upload this week’s export",
    description:
      "This file is not loaded yet. Upload it, then review the chats.",
    href: viewHref("upload"),
    label: "Upload this week’s export",
  };
}
