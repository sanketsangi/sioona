"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useReducer, useRef } from "react";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { Card, CardContent } from "@/components/ui/card";
import { llmQueryExtras } from "@/lib/detect-llm-query";
import {
  consumePartnerDemoNdjson,
  PARTNER_DEMO_NDJSON_CONTENT_TYPE,
  partnerDemoStatusLabel,
  resetDemoStatusLabel,
  type PartnerDemoStep,
} from "@/lib/partner-demo-progress";
import { syncQueryExtras } from "@/lib/prediction-sync";
import { humanizeInternalError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import {
  initialVaultShowcaseLoadUi,
  vaultShowcaseCanStartNewAttempt,
  type VaultShowcaseLoadUi,
  reduceVaultShowcaseLoadUi,
  resolveVaultShowcaseKind,
  shouldLandShowcaseLoad,
  VAULT_SHOWCASE_STALL_MS,
  vaultShowcaseFailedMessage,
  vaultShowcaseInsightsHref,
  vaultShowcaseLoadingLabel,
  vaultShowcaseStoreAction,
  type VaultShowcaseKind,
} from "@/lib/vault-showcase";
import { viewHref } from "@/lib/views";

const QUEUE_CARD_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base py-0 shadow-none ring-0 outline-none [--tw-ring-color:transparent]";

/**
 * When Insights is scoped to Sample / Partner Demo but that pack is not the
 * keep-set, wipe+seed via the existing store actions. Children stay on screen
 * for the whole attempt — stall and hard failure do not replace the queue.
 */
export function VaultShowcaseLoader({
  fileName,
  keepSetFileName,
  children,
}: {
  fileName: string;
  /** Prior keep-set. The queue is not replaced, so Cancel is not painted here. */
  keepSetFileName?: string | null;
  /** Insights queue while wipe+seed runs, including after stall / hard fail. */
  children: ReactNode;
}) {
  const router = useRouter();
  const kind = resolveVaultShowcaseKind(fileName);
  const [ui, dispatch] = useReducer(
    reduceVaultShowcaseLoadUi,
    kind ?? "sample",
    initialVaultShowcaseLoadUi,
  );
  const runIdRef = useRef(0);
  const [attempt, retry] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    if (!kind) return;
    const showcaseKind = kind;
    const action = vaultShowcaseStoreAction(showcaseKind);
    const failedMessage = vaultShowcaseFailedMessage(showcaseKind);
    const runId = ++runIdRef.current;
    let cancelled = false;
    let stalled = false;
    const abort = new AbortController();

    dispatch({ type: "start", kind: showcaseKind });
    // Wake sleeping Render while wipe starts (fail-soft).
    void fetch("/api/backend-health").catch(() => undefined);

    const stallTimer = window.setTimeout(() => {
      if (cancelled || runId !== runIdRef.current) return;
      stalled = true;
      dispatch({ type: "stall", kind: showcaseKind });
      // Do not abort — a wipe that finishes after stall still lands.
    }, VAULT_SHOWCASE_STALL_MS);

    async function load() {
      try {
        const res = await fetch("/api/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: PARTNER_DEMO_NDJSON_CONTENT_TYPE,
          },
          body: JSON.stringify({ action }),
          signal: abort.signal,
        });
        if (res.status === 401 || res.status === 403) {
          throw new Error("Sign in as an admin to load this demo. Existing data was kept.");
        }
        let lastStep: PartnerDemoStep | null = null;
        const data = await consumePartnerDemoNdjson(res, {
          failedMessage,
          onProgress: (event) => {
            // Stall already shows a soft-fail — don't flip back to progress copy.
            if (cancelled || stalled || runId !== runIdRef.current) return;
            if (event.step === lastStep) return;
            lastStep = event.step;
            dispatch({
              type: "progress",
              status:
                showcaseKind === "sample"
                  ? resetDemoStatusLabel(event)
                  : partnerDemoStatusLabel(event),
            });
          },
        });
        if (
          !shouldLandShowcaseLoad({
            runId,
            currentRunId: runIdRef.current,
          })
        ) {
          return;
        }

        dispatch({ type: "success" });

        const queryExtras = syncQueryExtras(data.predictionSync);
        const llmExtras = llmQueryExtras(data.detectLlm);
        router.replace(
          vaultShowcaseInsightsHref(showcaseKind, {
            replaced: true,
            syncFailed: queryExtras.syncFailed,
            syncCreated: queryExtras.syncCreated,
            llmAdded: llmExtras.llmAdded,
            llmFailed: llmExtras.llmFailed,
            llmFailure: llmExtras.llmFailure,
            wipeFailed: data.wipeFailed,
          }),
        );
        router.refresh();
      } catch (err) {
        if (abort.signal.aborted) return;
        if (cancelled || runId !== runIdRef.current) return;
        // Soft-stall only hid progress — a settled hard failure unlocks Retry.
        const raw = err instanceof Error ? err.message : failedMessage;
        dispatch({
          type: "hard_fail",
          message: humanizeInternalError(raw, failedMessage),
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
      abort.abort();
      window.clearTimeout(stallTimer);
    };
  }, [kind, router, attempt]);

  if (!kind) return null;

  // Keep the queue mounted, but surface a settled failure and a safe recovery.
  // A soft stall must never offer a second destructive attempt.
  return (
    <>
      {ui.error ? null : (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {ui.status ?? vaultShowcaseLoadingLabel(kind)}
        </span>
      )}
      <VaultShowcaseRecovery ui={ui} currentHref={keepSetFileName && resolveVaultShowcaseKind(keepSetFileName) !== kind ? viewHref("insights", { file:keepSetFileName }) : null} onRetry={() => {
        if (!vaultShowcaseCanStartNewAttempt(ui)) return;
        dispatch({ type: "start", kind });
        retry();
      }} />
      {children}
    </>
  );
}

export function VaultShowcaseRecovery({ ui, onRetry, currentHref }: { ui: VaultShowcaseLoadUi; onRetry: () => void; currentHref?: string | null }) {
  if (!ui.error) return null;
  const needsSignIn = ui.error.startsWith("Sign in as an admin");
  return <div role="alert" className="shrink-0 rounded-lg border border-sio-border-base bg-sio-bg-base p-3 text-sm">
    <p>{ui.error}</p>
    <div className="flex flex-wrap items-center gap-3">
      {needsSignIn ? <Link href="/login" className="inline-flex min-h-11 items-center underline focus-visible:outline-2">Sign in to load this demo</Link>
        : vaultShowcaseCanStartNewAttempt(ui) ? <button type="button" onClick={onRetry} className="btn-secondary min-h-11 touch-manipulation">Retry loading demo</button> : null}
      {currentHref ? <Link href={currentHref} className="inline-flex min-h-11 items-center underline focus-visible:outline-2">Open current corpus</Link> : null}
      <Link href={viewHref("upload")} className="inline-flex min-h-11 items-center underline focus-visible:outline-2">Open uploads</Link>
    </div>
  </div>;
}

/** Quiet fail / stall chrome — no spinner; honors prefers-reduced-motion. */
export function VaultShowcaseFailPanel({
  kind,
  error,
  showRetry,
  cancelHref,
  onRetry,
}: {
  kind: VaultShowcaseKind;
  error: string;
  showRetry: boolean;
  cancelHref: string;
  onRetry: () => void;
}) {
  return (
    <Card
      size="sm"
      className={cn(QUEUE_CARD_CLASS, "motion-reduce:transition-none")}
      role="alert"
    >
      <CardContent className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-12">
        <span
          className="mb-4 inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-sio-bg-muted text-sio-fg-subtle"
          aria-hidden
        >
          <LayersIcon className="size-4" />
        </span>
        <p
          className="text-balance text-heading-16 text-sio-fg-base"
          translate="no"
        >
          {vaultShowcaseFailedMessage(kind)}
        </p>
        <div className="mt-2 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
          <p>{error}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {showRetry ? (
            <button type="button" className="btn-primary" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          <Link href={cancelHref} className="btn-secondary">
            Cancel
          </Link>
          <Link href={viewHref("upload")} className="btn-tertiary">
            Open Upload
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
