"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { ResetDemoIcon } from "@/components/icons/ResetDemoIcon";
import { viewHref } from "@/lib/views";

export function ResetDemoButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function reset() {
    setLoading(true);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        wipeFailed?: boolean;
      };
      router.refresh();
      router.push(
        viewHref("insights", {
          wipeFailed: data.wipeFailed ? "1" : undefined,
        })
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
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
      Reset Demo Data…
    </button>
  );
}
