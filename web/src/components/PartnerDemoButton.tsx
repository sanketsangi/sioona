"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";

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

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Demo failed");
      router.push("/?view=insights&demo=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-start">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        aria-busy={loading}
        className={className}
      >
        {loading ? <ButtonSpinner /> : null}
        {label}
      </button>
      <div aria-live="polite">
        {error ? (
          <span className="text-label-13 text-ds-red-900" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </span>
  );
}
