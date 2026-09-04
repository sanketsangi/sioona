/**
 * Vault Sample / Partner Demo showcase packs — load via existing Reset /
 * Partner Demo store actions (wipe + seed), not a parallel data path.
 * When the pack is already the keep-set, clients skip POST and open Insights.
 */
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  matchesVaultSampleName,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import { vaultInsightsHref } from "@/lib/vault-file";
import { viewHref } from "@/lib/views";

export type VaultShowcaseKind = "sample" | "partner";

export type VaultShowcaseAction = "reset" | "partner_demo";

/** True when `file` is the Sample or Partner Demo catalog name. */
export function isVaultShowcaseFile(
  file: string | null | undefined,
): boolean {
  return resolveVaultShowcaseKind(file) != null;
}

export function resolveVaultShowcaseKind(
  file: string | null | undefined,
): VaultShowcaseKind | null {
  if (!file?.trim()) return null;
  if (matchesVaultSampleName(file, GROWW_SHOWCASE_SAMPLE_NAME)) {
    return "sample";
  }
  if (matchesVaultSampleName(file, ZERODHA_BATCH02_SAMPLE_NAME)) {
    return "partner";
  }
  return null;
}

/** True when the keep-set already is this showcase pack (no wipe+seed needed). */
export function vaultShowcaseAlreadyActive(
  kind: VaultShowcaseKind,
  lastUploadedFileName: string | null | undefined,
): boolean {
  const catalog =
    kind === "sample"
      ? GROWW_SHOWCASE_SAMPLE_NAME
      : ZERODHA_BATCH02_SAMPLE_NAME;
  return matchesVaultSampleName(lastUploadedFileName, catalog);
}

export function vaultShowcaseStoreAction(
  kind: VaultShowcaseKind,
): VaultShowcaseAction {
  return kind === "sample" ? "reset" : "partner_demo";
}

export function vaultShowcaseDisplayName(kind: VaultShowcaseKind): string {
  return kind === "sample"
    ? GROWW_SHOWCASE_SAMPLE_NAME
    : ZERODHA_BATCH02_SAMPLE_NAME;
}

/** Idle / first-paint label before NDJSON progress arrives. */
export function vaultShowcaseLoadingLabel(kind: VaultShowcaseKind): string {
  return kind === "sample"
    ? "Finding signals…"
    : "Finding signals…";
}

/** Realistic wait copy under the status line. */
export function vaultShowcaseExpectation(): string {
  return "Usually ready in about 20 seconds.";
}

export function vaultShowcaseFailedMessage(kind: VaultShowcaseKind): string {
  return kind === "sample"
    ? "Sample failed to load"
    : "Partner Demo failed to load";
}

export function vaultShowcaseStallMessage(kind: VaultShowcaseKind): string {
  const pack = kind === "sample" ? "Sample" : "Partner Demo";
  return `${pack} is taking longer than expected. Retry, or cancel to stay on the current batch.`;
}

/** How long the loader may spin before a soft-fail. */
export const VAULT_SHOWCASE_STALL_MS = 30_000;

/**
 * Land on Insights after a finished wipe+seed even if the 30s soft-fail
 * already painted. Discarding success leaves the store on the new pack
 * while chrome still shows Retry (another wipe). Stall only hides
 * in-flight progress. Cancel / unmount and Retry (new runId) do not land.
 */
export function shouldLandShowcaseLoad(opts: {
  cancelled: boolean;
  runId: number;
  currentRunId: number;
}): boolean {
  return !opts.cancelled && opts.runId === opts.currentRunId;
}

/**
 * Cancel must leave the in-flight load. With no keep-set name, Sample
 * Insights is the same URL that started the loader (bare Insights
 * defaults to Sample and auto-loads). Upload does not re-trigger it.
 */
export function vaultShowcaseCancelHref(
  keepSetFileName?: string | null,
): string {
  const name = keepSetFileName?.trim();
  if (name) return vaultInsightsHref(name);
  return viewHref("upload");
}
