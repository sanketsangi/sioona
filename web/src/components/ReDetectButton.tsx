"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { ButtonSpinner } from "@/components/ButtonSpinner";

export function ReDetectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      await fetch("/api/detect", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
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
        <RefreshCw className="size-3.5" strokeWidth={1.5} aria-hidden />
      )}
      Re-run Detection
    </button>
  );
}
