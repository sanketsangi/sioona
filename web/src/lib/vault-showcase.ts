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

/**
 * Insights href after opening a showcase pack. Partner sets `demo=1`.
 * Pass `replaced: true` after a fresh wipe+seed so Neon overlay stays quiet.
 */
export function vaultShowcaseInsightsHref(
  kind: VaultShowcaseKind,
  extras?: {
    replaced?: boolean;
    syncFailed?: string | null;
    syncCreated?: string | null;
    llmAdded?: string | null;
    llmFailed?: string | null;
    wipeFailed?: boolean;
  },
): string {
  return vaultInsightsHref(vaultShowcaseDisplayName(kind), {
    demo: kind === "partner" ? "1" : undefined,
    replaced: extras?.replaced ? "1" : undefined,
    syncFailed: extras?.syncFailed ?? undefined,
    syncCreated: extras?.syncCreated ?? undefined,
    llmAdded: extras?.llmAdded ?? undefined,
    llmFailed: extras?.llmFailed ?? undefined,
    wipeFailed: extras?.wipeFailed ? "1" : undefined,
  });
}

/**
 * Vault sidebar / Workspace Insights: when the keep-set already matches,
 * a normal Link navigation is enough (no wipe, no VaultShowcaseLoader).
 */
export function vaultShowcaseNavigateOnly(
  kind: VaultShowcaseKind,
  lastUploadedFileName: string | null | undefined,
): boolean {
  return vaultShowcaseAlreadyActive(kind, lastUploadedFileName);
}

/** Idle / first-paint label before NDJSON progress arrives. */
export function vaultShowcaseLoadingLabel(_kind: VaultShowcaseKind): string {
  return "Finding signals…";
}

/** Realistic wait copy under the status line. */
export function vaultShowcaseExpectation(): string {
  return "Usually ready in about 20 seconds.";
}

/**
 * Quiet Insights empty CTA while Sample / Partner Demo wipe+seed runs.
 * Cancel → Upload (same as in-flight loader Cancel — never prior keep-set).
 */
export function vaultShowcaseWaitEmptyNext(kind: VaultShowcaseKind): {
  title: string;
  description: string;
  href: string;
  label: string;
} {
  return {
    title: vaultShowcaseDisplayName(kind),
    description: `${vaultShowcaseLoadingLabel(kind)} ${vaultShowcaseExpectation()}`,
    href: viewHref("upload"),
    label: "Cancel",
  };
}

export function vaultShowcaseFailedMessage(kind: VaultShowcaseKind): string {
  return kind === "sample"
    ? "Sample failed to load"
    : "Partner Demo failed to load";
}

/**
 * Soft-fail while the original wipe is still running. Do not mention Retry
 * (hidden until settle) or imply Cancel restores the current keep-set.
 */
export function vaultShowcaseStallMessage(kind: VaultShowcaseKind): string {
  const pack = kind === "sample" ? "Sample" : "Partner Demo";
  return `${pack} is taking longer than expected. Still waiting on the current load… Cancel opens Upload.`;
}

/** How long the loader may spin before a soft-fail. */
export const VAULT_SHOWCASE_STALL_MS = 30_000;

/**
 * Land on Insights after a finished wipe+seed even if the 30s soft-fail
 * already painted, or Cancel unmounted the loader. Discarding success
 * leaves the store on the new pack while chrome still shows Retry
 * (another wipe) or Cancel to a stale keep-set that auto-loads again.
 * Stall only hides in-flight progress. Retry (new runId) stays discarded.
 * In-flight Cancel aborts the POST so consume does not finish.
 */
export function shouldLandShowcaseLoad(opts: {
  /** Unmount / Cancel — ignored when this run's consume already finished. */
  cancelled?: boolean;
  runId: number;
  currentRunId: number;
}): boolean {
  return opts.runId === opts.currentRunId;
}

/**
 * Loader UI for one wipe attempt. Soft-stall never starts a second wipe;
 * Retry is only for a hard failure after this attempt's POST settles.
 */
export type VaultShowcaseLoadUi = {
  status: string | null;
  error: string | null;
  /**
   * True while Cancel must open Upload: through the in-flight wipe and after
   * success until Insights land unmounts this loader (router.replace window).
   * Cleared only on hard_fail so Retry can unlock; empty keep-set Cancel is
   * Upload either way.
   */
  wipeInFlight: boolean;
  /** Settled failure — Retry may bump attempt and start one new wipe. */
  hardFailed: boolean;
};

export type VaultShowcaseLoadUiEvent =
  | { type: "start"; kind: VaultShowcaseKind }
  | { type: "progress"; status: string }
  | { type: "stall"; kind: VaultShowcaseKind }
  | { type: "hard_fail"; message: string }
  | { type: "success" };

export function initialVaultShowcaseLoadUi(
  kind: VaultShowcaseKind,
): VaultShowcaseLoadUi {
  return {
    status: vaultShowcaseLoadingLabel(kind),
    error: null,
    wipeInFlight: true,
    hardFailed: false,
  };
}

export function reduceVaultShowcaseLoadUi(
  state: VaultShowcaseLoadUi,
  event: VaultShowcaseLoadUiEvent,
): VaultShowcaseLoadUi {
  switch (event.type) {
    case "start":
      return initialVaultShowcaseLoadUi(event.kind);
    case "progress":
      if (state.error || !state.wipeInFlight) return state;
      return { ...state, status: event.status };
    case "stall":
      if (!state.wipeInFlight || state.hardFailed) return state;
      return {
        ...state,
        error: vaultShowcaseStallMessage(event.kind),
        status: null,
      };
    case "hard_fail":
      return {
        status: null,
        error: event.message,
        wipeInFlight: false,
        hardFailed: true,
      };
    case "success":
      // Keep wipeInFlight true through router.replace so Cancel stays Upload
      // while a stall error (or spinner) is still painted — clearing it would
      // briefly target the prior keep-set and auto-load the stale pack.
      return {
        ...state,
        wipeInFlight: true,
        hardFailed: false,
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Retry only after the in-flight POST settled with a hard failure. */
export function vaultShowcaseShowRetry(state: VaultShowcaseLoadUi): boolean {
  return state.hardFailed && !state.wipeInFlight;
}

/**
 * Soft-stall must not bump attempt / start a second wipe while the first
 * POST is still alive.
 */
export function vaultShowcaseCanStartNewAttempt(
  state: VaultShowcaseLoadUi,
): boolean {
  return vaultShowcaseShowRetry(state);
}

/**
 * Cancel must leave the load. While wipeInFlight (in-flight wipe or success
 * awaiting Insights land), always Upload — never prior keep-set Insights
 * (store may already be the new pack, which would auto-load Sample / Partner
 * Demo again). With no keep-set name, Upload likewise avoids bare Insights
 * defaulting to Sample. After hard_fail settles, Cancel may return to the
 * prior keep-set when one exists.
 */
export function vaultShowcaseCancelHref(
  keepSetFileName?: string | null,
  opts?: { wipeInFlight?: boolean },
): string {
  if (opts?.wipeInFlight) return viewHref("upload");
  const name = keepSetFileName?.trim();
  if (name) return vaultInsightsHref(name);
  return viewHref("upload");
}
