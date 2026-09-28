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
import { catalogFileKey } from "@/lib/upload-filename";
import { viewHref } from "@/lib/views";

export { GROWW_SHOWCASE_SAMPLE_NAME, ZERODHA_BATCH02_SAMPLE_NAME };

/** Trimmed `?file=` value, or null when omitted / blank. */
export function parseVaultFile(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Insights vault scope: explicit `?file=` wins. Bare Insights stays on a live
 * weekly upload so Sample auto-load does not replace it. With no upload,
 * bare Insights is Sample (Groww_batch_02).
 */
export function resolveInsightsVaultFile(
  raw?: string | null,
  lastUploadedFileName?: string | null,
): string {
  const explicit = parseVaultFile(raw);
  if (explicit) return explicit;
  const keep = lastUploadedFileName?.trim();
  if (isLivePartnerKeepSet(keep)) return keep!;
  return GROWW_SHOWCASE_SAMPLE_NAME;
}

/** Workspace Insights / brand. A live upload must not navigate into Sample. */
export function insightsHomeHref(
  lastUploadedFileName?: string | null,
): string {
  const keep = lastUploadedFileName?.trim();
  if (isLivePartnerKeepSet(keep)) return vaultInsightsHref(keep!);
  return defaultInsightsHref();
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

/** Basename only, so a path stamp matches the vault `?file=` label. */
function vaultBasename(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.split(/[/\\]/).pop()?.trim();
  return base || trimmed;
}

/** Case-folded stem: `Batch_02.JSON` and `batch_02` are the same file. */
function vaultStemKey(name: string): string {
  return vaultBasename(name).replace(/\.[^.]+$/, "").toLowerCase();
}

/**
 * Finder duplicate names (`file copy.json`, `file copy 2.json`) are the
 * same upload as `file.json`. Catalog copies (`file (2).json`) stay distinct.
 */
function withoutMacCopySuffix(stem: string): string {
  return stem.replace(/ copy(?: \d+)?$/, "");
}

/**
 * Same upload when stems match, or the catalog label only adds a prefix
 * (`Groww_batch_02` ↔ `batch_02.json`). Distinct copies (`batch_02 (2)`)
 * stay different.
 */
function sameUploadStem(a: string, b: string): boolean {
  const left = withoutMacCopySuffix(vaultStemKey(a));
  const right = withoutMacCopySuffix(vaultStemKey(b));
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < 4) return false;
  return longer.endsWith(`_${shorter}`);
}

/**
 * True when this vault row is the active keep-set (`lastUploadedFileName`)
 * or the same upload under another stamp: extension, letter case, or path.
 */
export function vaultFileMatchesKeepSet(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
): boolean {
  const file = vaultFile?.trim();
  const last = lastUploadedFileName?.trim();
  if (!file || !last) return false;
  const fileBase = vaultBasename(file);
  const lastBase = vaultBasename(last);
  if (catalogFileKey(fileBase) === catalogFileKey(lastBase)) return true;
  // Sample chrome: Groww_batch_02 ↔ Groww_batch_02.csv
  if (matchesVaultSampleName(lastBase, fileBase)) return true;
  if (matchesVaultSampleName(fileBase, lastBase)) return true;
  return sameUploadStem(file, last);
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
 * A live filename with zero chats is still landing — not loaded.
 */
export function vaultFileIsLoaded(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
  uploadedFileNames: readonly string[] = [],
  chatCount?: number,
): boolean {
  const file = parseVaultFile(vaultFile);
  if (!file) return true;
  // Filename fallback can list a weekly upload before any chat is stored.
  if (chatCount === 0) return false;
  const inCatalog = uploadedFileIndex(uploadedFileNames, file) >= 0;
  if (vaultFileMatchesKeepSet(file, lastUploadedFileName)) return true;
  return inCatalog;
}

/**
 * Hide Sample / Partner Demo only when that partner file is actually loaded.
 * A `?file=` name alone must not hide them while the store is still Sample.
 */
export function livePartnerVaultChrome(opts: {
  activeFile?: string | null;
  lastUploadedFileName?: string | null;
  uploadedFileNames?: readonly string[];
  chatCount?: number;
}): boolean {
  const active =
    parseVaultFile(opts.activeFile) ?? opts.lastUploadedFileName?.trim() ?? "";
  if (!isLivePartnerKeepSet(active)) return false;
  return vaultFileIsLoaded(
    active,
    opts.lastUploadedFileName,
    opts.uploadedFileNames ?? [],
    opts.chatCount,
  );
}

/** Stamp chats that Neon stored without a filename (single-file weekly replace). */
export function stampUnstampedSourceFile<T extends { sourceFile?: string }>(
  conversations: T[],
  fileName: string | null | undefined,
): T[] {
  const name = fileName?.trim();
  if (!name || !isLivePartnerKeepSet(name)) return conversations;
  if (conversations.some((conversation) => conversation.sourceFile?.trim())) {
    return conversations;
  }
  return conversations.map((conversation) => ({
    ...conversation,
    sourceFile: name,
  }));
}

/**
 * Insights refresh while a weekly upload is still landing in Neon.
 * Deferred dual-write of a 100-chat pack can take about a minute.
 */
export const VAULT_KEEP_SET_REFRESH_LIMIT = 16;

export function vaultKeepSetRefreshStorageKey(fileName: string): string {
  return `sioona-vault-refresh:${fileName}`;
}

export function readVaultKeepSetRefreshAttempt(fileName: string): number {
  if (typeof window === "undefined" || !fileName) return 0;
  try {
    const raw = window.sessionStorage.getItem(
      vaultKeepSetRefreshStorageKey(fileName),
    );
    const attempt = Number(raw ?? "0");
    return Number.isFinite(attempt) ? attempt : 0;
  } catch {
    return 0;
  }
}

export function vaultKeepSetRefreshDelay(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0) return null;
  if (attempt >= VAULT_KEEP_SET_REFRESH_LIMIT) return null;
  return Math.min(8_000, 1_000 + attempt * 1_000);
}

export const VAULT_IMPORT_LANDING_TITLE = "Loading this week’s export";
export const VAULT_IMPORT_LANDING_DESCRIPTION =
  "The chats are still opening. They show up here in a moment.";

/**
 * True when Insights/Eval can render the selected vault's keep-set
 * (not a showcase loader / mismatch empty). Ready notifications use this.
 */
export function isVaultBatchRenderable(
  vaultFile: string | null | undefined,
  lastUploadedFileName: string | null | undefined,
  uploadedFileNames: readonly string[] = [],
  chatCount?: number,
): boolean {
  return vaultFileIsLoaded(
    vaultFile,
    lastUploadedFileName,
    uploadedFileNames,
    chatCount,
  );
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
  lastUploadedFileName?: string | null,
): T {
  if (uploadedFileNames.length < 2) return chats;
  const file = parseVaultFile(vaultFile);
  if (!file) return chats;
  const index = uploadedFileIndex(uploadedFileNames, file);
  if (index < 0) return chats;
  const matched = uploadedFileNames[index];
  const fallback = uploadedFileNames[uploadedFileNames.length - 1];
  // Chats with no stamp belong to the keep-set, even when it is not the
  // last catalog row and the URL only differs by extension or case.
  const keepUnstamped =
    matched === fallback ||
    vaultFileMatchesKeepSet(matched, lastUploadedFileName) ||
    vaultFileMatchesKeepSet(file, lastUploadedFileName);
  const conversations = chats.conversations.filter((conversation) => {
    const source = conversation.sourceFile?.trim();
    if (source) {
      return (
        vaultFileMatchesKeepSet(source, matched) ||
        vaultFileMatchesKeepSet(source, file)
      );
    }
    return keepUnstamped;
  });
  const fileIsLoaded =
    vaultFileMatchesKeepSet(file, lastUploadedFileName) ||
    chats.conversations.some((conversation) =>
      vaultFileMatchesKeepSet(conversation.sourceFile, file),
    );
  // A stem/case miss must not blank the loaded file's queue.
  if (conversations.length === 0 && fileIsLoaded) return chats;
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
