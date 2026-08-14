"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { RefreshClockwiseIcon } from "@/components/icons/RefreshClockwiseIcon";
import { cn } from "@/lib/utils";
import {
  llmQueryExtras,
  parseLlmPassStats,
} from "@/lib/detect-llm-query";
import {
  hasSyncFailures,
  parsePredictionSync,
  syncQueryExtras,
} from "@/lib/prediction-sync";

export function ReDetectButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fullWidth = Boolean(className && /\bw-full\b/.test(className));
  const autoWidthMd = Boolean(className && /\bmd:w-auto\b/.test(className));

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/detect", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        predictionSync?: unknown;
        detectLlm?: unknown;
      };
      if (!res.ok) {
        throw new Error(data.error || "Detection failed");
      }

      const sync = parsePredictionSync(data.predictionSync);
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      params.set("view", params.get("view") || "insights");
      // Clear prior sync failure markers, then re-apply if still failing
      params.delete("syncFailed");
      params.delete("syncCreated");
      params.delete("llmAdded");
      params.delete("llmFailed");
      const extras = syncQueryExtras(sync);
      if (extras.syncFailed) params.set("syncFailed", extras.syncFailed);
      if (extras.syncCreated) params.set("syncCreated", extras.syncCreated);
      const llmExtras = llmQueryExtras(parseLlmPassStats(data.detectLlm));
      if (llmExtras.llmAdded) params.set("llmAdded", llmExtras.llmAdded);
      if (llmExtras.llmFailed) params.set("llmFailed", llmExtras.llmFailed);

      if (hasSyncFailures(sync) && sync) {
        setError(
          `${sync.failed} prediction${sync.failed === 1 ? "" : "s"} still not written to Neon. Check BACKEND_URL and FastAPI.`
        );
      }

      router.push(`/?${params.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span
      className={cn(
        "relative inline-flex max-w-full",
        fullWidth && "w-full",
        autoWidthMd && "md:w-auto",
      )}
    >
      <button
        type="button"
        onClick={run}
        disabled={loading}
        aria-busy={loading}
        className={cn("btn-secondary", className)}
      >
        {loading ? (
          <ButtonSpinner />
        ) : (
          <RefreshClockwiseIcon className="size-3.5 shrink-0" />
        )}
        Re-run Detection
      </button>
      {error ? (
        <p
          className="absolute end-0 top-full z-10 mt-1 max-w-xs text-pretty text-right text-label-13 text-sio-status-danger-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </span>
  );
}
