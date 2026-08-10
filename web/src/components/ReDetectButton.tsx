"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react/ssr";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import {
  hasSyncFailures,
  parsePredictionSync,
  syncQueryExtras,
} from "@/lib/prediction-sync";

export function ReDetectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/detect", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        predictionSync?: unknown;
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
      const extras = syncQueryExtras(sync);
      if (extras.syncFailed) params.set("syncFailed", extras.syncFailed);
      if (extras.syncCreated) params.set("syncCreated", extras.syncCreated);

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
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        aria-busy={loading}
        className="btn-secondary"
      >
        {loading ? (
          <ButtonSpinner />
        ) : (
          <ArrowsClockwise className="size-3.5" weight="regular" aria-hidden />
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
