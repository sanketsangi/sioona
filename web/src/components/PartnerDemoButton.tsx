"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { llmQueryExtras } from "@/lib/detect-llm-query";
import {
  consumePartnerDemoNdjson,
  PARTNER_DEMO_NDJSON_CONTENT_TYPE,
  partnerDemoStatusLabel,
  type PartnerDemoStep,
} from "@/lib/partner-demo-progress";
import {
  hasSyncFailures,
  syncQueryExtras,
} from "@/lib/prediction-sync";
import { cn } from "@/lib/utils";
import {
  vaultShowcaseAlreadyActive,
  vaultShowcaseDisplayName,
  vaultShowcaseStoreAction,
} from "@/lib/vault-showcase";

/** Canonical Partner Demo pack — same as Vault `Zerodha_batch_02` / Upload CTA. */
const PARTNER_DEMO_FILE = vaultShowcaseDisplayName("partner");
const PARTNER_DEMO_ACTION = vaultShowcaseStoreAction("partner");

export function PartnerDemoButton({
  className = "btn-primary",
  label = "Start Partner Demo",
  lastUploadedFileName,
  onErrorChange,
}: {
  className?: string;
  label?: string;
  /**
   * Keep-set breadcrumb only — gates the already-active short-circuit.
   * Never selects the pack: Partner Demo always loads Zerodha_batch_02.
   */
  lastUploadedFileName?: string | null;
  /** Surface demo failure in-panel (parent owns the alert). */
  onErrorChange?: (error: string | null) => void;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const fullWidth = /\bw-full\b/.test(className);
  const autoWidthMd = /\bmd:w-auto\b/.test(className);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    onErrorChange?.(error);
  }, [error, onErrorChange]);

  useEffect(() => {
    if (!loading && hadErrorRef.current) {
      buttonRef.current?.focus();
      hadErrorRef.current = false;
    }
  }, [loading]);

  function openPartnerInsights(extras?: {
    syncFailed?: string;
    syncCreated?: string;
    llmAdded?: string;
    llmFailed?: string;
    llmFailure?: string;
    wipeFailed?: boolean;
    /** Fresh showcase apply — hide leftover Neon overlay until prune. */
    replaced?: boolean;
  }) {
    const query = new URLSearchParams({
      view: "insights",
      demo: "1",
      file: PARTNER_DEMO_FILE,
    });
    if (extras?.replaced) query.set("replaced", "1");
    if (extras?.syncFailed) query.set("syncFailed", extras.syncFailed);
    if (extras?.syncCreated) query.set("syncCreated", extras.syncCreated);
    if (extras?.llmAdded) query.set("llmAdded", extras.llmAdded);
    if (extras?.llmFailed) query.set("llmFailed", extras.llmFailed);
    if (extras?.llmFailure) query.set("llmFailure", extras.llmFailure);
    if (extras?.wipeFailed) query.set("wipeFailed", "1");
    router.replace(`/?${query.toString()}`);
    router.refresh();
  }

  async function run() {
    // Already on Partner Demo keep-set — open Insights without wipe+seed.
    // Groww / weekly Zerodha uploads are not this pack — always wipe+seed.
    if (vaultShowcaseAlreadyActive("partner", lastUploadedFileName)) {
      openPartnerInsights();
      return;
    }

    setLoading(true);
    setError(null);
    setSyncWarning(null);
    // Wake sleeping Render while wipe starts (fail-soft).
    void fetch("/api/backend-health").catch(() => undefined);
    // First real stream step is wipe → partner-facing "Uploading…"
    setPipelineStatus("Uploading…");
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: PARTNER_DEMO_NDJSON_CONTENT_TYPE,
        },
        body: JSON.stringify({ action: PARTNER_DEMO_ACTION }),
      });
      let lastStep: PartnerDemoStep | null = null;
      const data = await consumePartnerDemoNdjson(res, {
        onProgress: (event) => {
          if (event.step === lastStep) return;
          lastStep = event.step;
          setPipelineStatus(partnerDemoStatusLabel(event));
        },
      });

      const sync = data.predictionSync;
      const extras = syncQueryExtras(sync);
      const llmExtras = llmQueryExtras(data.detectLlm);

      if (hasSyncFailures(sync) && sync) {
        setSyncWarning(
          `${sync.failed} prediction${sync.failed === 1 ? "" : "s"} not written to Neon — pending queue may be empty until FastAPI is up. Opening Insights…`
        );
      } else if (data.wipeFailed) {
        setSyncWarning(
          "Demo loaded, but Neon wipe failed — leftover chats may remain until FastAPI is up. Opening Insights…"
        );
      }

      // replace: drop a stale `?preview=sig_neon_…` from the prior queue so
      // Back does not reopen an orphan card after the store reset.
      openPartnerInsights({
        replaced: true,
        syncFailed: extras.syncFailed ?? undefined,
        syncCreated: extras.syncCreated ?? undefined,
        llmAdded: llmExtras.llmAdded ?? undefined,
        llmFailed: llmExtras.llmFailed ?? undefined,
        llmFailure: llmExtras.llmFailure ?? undefined,
        wipeFailed: data.wipeFailed,
      });
    } catch (err) {
      hadErrorRef.current = true;
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoading(false);
      setPipelineStatus(null);
    }
  }

  return (
    <span
      className={cn(
        "relative inline-flex max-w-full",
        fullWidth && "w-full",
        autoWidthMd && "md:w-auto"
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={run}
        disabled={loading}
        aria-busy={loading}
        className={className}
      >
        {loading ? (
          <ButtonSpinner />
        ) : (
          <PlayCircleIcon className="size-3.5 shrink-0" />
        )}
        <span className="relative inline-grid justify-items-center">
          <span className={cn("col-start-1 row-start-1", loading && "invisible")}>
            {label}
          </span>
          {loading ? (
            <span
              className="col-start-1 row-start-1 min-w-0 truncate"
              aria-live="polite"
              aria-atomic="true"
            >
              {pipelineStatus ?? "Uploading…"}
            </span>
          ) : null}
        </span>
      </button>
      {syncWarning ? (
        <span className="sr-only" role="status" aria-live="polite">
          {syncWarning}
        </span>
      ) : null}
    </span>
  );
}
