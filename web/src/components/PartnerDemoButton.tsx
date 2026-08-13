"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import {
  llmQueryExtras,
  parseLlmPassStats,
} from "@/lib/detect-llm-query";
import {
  hasSyncFailures,
  parsePredictionSync,
  syncQueryExtras,
} from "@/lib/prediction-sync";

export function PartnerDemoButton({
  className = "btn-primary",
  label = "Start Partner Demo",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setSyncWarning(null);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      });
      const data = (await res.json()) as {
        error?: string;
        predictionSync?: unknown;
        detectLlm?: unknown;
      };
      if (!res.ok) throw new Error(data.error || "Demo failed");

      const sync = parsePredictionSync(data.predictionSync);
      const query = new URLSearchParams({ view: "insights", demo: "1" });
      const extras = syncQueryExtras(sync);
      if (extras.syncFailed) query.set("syncFailed", extras.syncFailed);
      if (extras.syncCreated) query.set("syncCreated", extras.syncCreated);
      const llmExtras = llmQueryExtras(parseLlmPassStats(data.detectLlm));
      if (llmExtras.llmAdded) query.set("llmAdded", llmExtras.llmAdded);
      if (llmExtras.llmFailed) query.set("llmFailed", llmExtras.llmFailed);

      if (hasSyncFailures(sync) && sync) {
        setSyncWarning(
          `${sync.failed} prediction${sync.failed === 1 ? "" : "s"} not written to Neon — pending queue may be empty until FastAPI is up. Opening Insights…`
        );
      }

      // replace: drop a stale `?preview=sig_neon_…` from the prior queue so
      // Back does not reopen an orphan card after the store reset.
      router.replace(`/?${query.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
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
        {label}
      </button>
      <div
        className="absolute start-0 top-full z-10 mt-1 max-w-xs text-pretty"
        aria-live="polite"
      >
        {error ? (
          <span className="text-label-13 text-sio-status-danger-fg" role="alert">
            {error}
          </span>
        ) : null}
        {syncWarning ? (
          <span className="text-label-13 text-sio-fg-subtle" role="status">
            {syncWarning}
          </span>
        ) : null}
      </div>
    </span>
  );
}
