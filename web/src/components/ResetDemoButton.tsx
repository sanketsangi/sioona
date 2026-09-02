"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { ResetDemoIcon } from "@/components/icons/ResetDemoIcon";
import {
  consumePartnerDemoNdjson,
  PARTNER_DEMO_NDJSON_CONTENT_TYPE,
  resetDemoStatusLabel,
  type PartnerDemoStep,
} from "@/lib/partner-demo-progress";
import { cn } from "@/lib/utils";
import { viewHref } from "@/lib/views";

export function ResetDemoButton({
  onErrorChange,
}: {
  /** Surface reset failure in-panel (parent owns the alert). */
  onErrorChange?: (error: string | null) => void;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function reset() {
    setLoading(true);
    setError(null);
    setPipelineStatus("Resetting…");
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: PARTNER_DEMO_NDJSON_CONTENT_TYPE,
        },
        body: JSON.stringify({ action: "reset" }),
      });
      let lastStep: PartnerDemoStep | null = null;
      const data = await consumePartnerDemoNdjson(res, {
        failedMessage: "Reset failed",
        onProgress: (event) => {
          if (event.step === lastStep) return;
          lastStep = event.step;
          setPipelineStatus(resetDemoStatusLabel(event));
        },
      });

      router.refresh();
      router.push(
        viewHref("insights", {
          wipeFailed: data.wipeFailed ? "1" : undefined,
        })
      );
    } catch (err) {
      hadErrorRef.current = true;
      const raw = err instanceof Error ? err.message : "Reset failed";
      setError(raw === "Failed to fetch" ? "Reset failed" : raw);
    } finally {
      setLoading(false);
      setPipelineStatus(null);
    }
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={reset}
      disabled={loading}
      aria-busy={loading}
      className="btn-secondary rounded-[var(--radius-panel)]"
    >
      {loading ? (
        <ButtonSpinner />
      ) : (
        <ResetDemoIcon className="size-3.5 shrink-0" />
      )}
      <span className="relative inline-grid justify-items-center">
        <span className={cn("col-start-1 row-start-1", loading && "invisible")}>
          Reset Demo Data…
        </span>
        {loading ? (
          <span
            className="col-start-1 row-start-1 min-w-0 truncate"
            aria-live="polite"
            aria-atomic="true"
          >
            {pipelineStatus ?? "Resetting…"}
          </span>
        ) : null}
      </span>
    </button>
  );
}
