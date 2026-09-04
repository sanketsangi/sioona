"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
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
import { cn } from "@/lib/utils";
import {
  resolveVaultShowcaseKind,
  vaultShowcaseDisplayName,
  vaultShowcaseFailedMessage,
  vaultShowcaseLoadingLabel,
  vaultShowcaseStoreAction,
  type VaultShowcaseKind,
} from "@/lib/vault-showcase";
import { viewHref } from "@/lib/views";

const QUEUE_CARD_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base py-0 shadow-none ring-0 outline-none [--tw-ring-color:transparent]";

/**
 * When Insights is scoped to Sample / Partner Demo but that pack is not the
 * keep-set, wipe+seed via the existing store actions and land on Insights.
 */
export function VaultShowcaseLoader({ fileName }: { fileName: string }) {
  const router = useRouter();
  const kind = resolveVaultShowcaseKind(fileName);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<string | null>(
    kind ? vaultShowcaseLoadingLabel(kind) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!kind) return;
    const showcaseKind = kind;
    const displayName = vaultShowcaseDisplayName(showcaseKind);
    const action = vaultShowcaseStoreAction(showcaseKind);
    const failedMessage = vaultShowcaseFailedMessage(showcaseKind);
    const runId = ++runIdRef.current;
    let cancelled = false;

    setError(null);
    setStatus(vaultShowcaseLoadingLabel(showcaseKind));
    // Wake sleeping Render while wipe starts (fail-soft).
    void fetch("/api/backend-health").catch(() => undefined);

    async function load() {
      try {
        const res = await fetch("/api/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: PARTNER_DEMO_NDJSON_CONTENT_TYPE,
          },
          body: JSON.stringify({ action }),
        });
        let lastStep: PartnerDemoStep | null = null;
        const data = await consumePartnerDemoNdjson(res, {
          failedMessage,
          onProgress: (event) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (event.step === lastStep) return;
            lastStep = event.step;
            setStatus(
              showcaseKind === "sample"
                ? resetDemoStatusLabel(event)
                : partnerDemoStatusLabel(event),
            );
          },
        });
        if (cancelled || runId !== runIdRef.current) return;

        const query = new URLSearchParams({
          view: "insights",
          file: displayName,
          replaced: "1",
        });
        if (showcaseKind === "partner") query.set("demo", "1");
        const extras = syncQueryExtras(data.predictionSync);
        if (extras.syncFailed) query.set("syncFailed", extras.syncFailed);
        if (extras.syncCreated) query.set("syncCreated", extras.syncCreated);
        const llmExtras = llmQueryExtras(data.detectLlm);
        if (llmExtras.llmAdded) query.set("llmAdded", llmExtras.llmAdded);
        if (llmExtras.llmFailed) query.set("llmFailed", llmExtras.llmFailed);
        if (data.wipeFailed) query.set("wipeFailed", "1");

        router.replace(`/?${query.toString()}`);
        router.refresh();
      } catch (err) {
        if (cancelled || runId !== runIdRef.current) return;
        const raw = err instanceof Error ? err.message : failedMessage;
        setError(raw === "Failed to fetch" ? failedMessage : raw);
        setStatus(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, attempt, router]);

  if (!kind) return null;

  return (
    <VaultShowcaseLoadingPanel
      kind={kind}
      status={status}
      error={error}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function VaultShowcaseLoadingPanel({
  kind,
  status,
  error,
  onRetry,
}: {
  kind: VaultShowcaseKind;
  status: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  const displayName = vaultShowcaseDisplayName(kind);
  const loading = !error;

  return (
    <Card
      size="sm"
      className={cn(QUEUE_CARD_CLASS)}
      role={error ? "alert" : undefined}
    >
      <CardContent className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-12">
        <span
          className="mb-4 inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-sio-bg-muted text-sio-fg-subtle"
          aria-hidden
        >
          {loading ? (
            <ButtonSpinner className="size-4" />
          ) : (
            <LayersIcon className="size-4" />
          )}
        </span>
        <p
          className="text-balance text-heading-16 text-sio-fg-base"
          translate="no"
        >
          {error ? vaultShowcaseFailedMessage(kind) : displayName}
        </p>
        <div className="mt-2 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
          {error ? (
            <p>{error}</p>
          ) : (
            <p aria-live="polite" aria-atomic="true">
              {status ?? vaultShowcaseLoadingLabel(kind)}
            </p>
          )}
        </div>
        {error ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" className="btn-primary" onClick={onRetry}>
              Try Again
            </button>
            <Link href={viewHref("upload")} className="btn-secondary">
              Open Upload
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
