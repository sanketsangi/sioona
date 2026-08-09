"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { viewHref } from "@/lib/views";

export function ResetDemoButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function reset() {
    setLoading(true);
    try {
      await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      router.refresh();
      router.push(viewHref("insights"));
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-label-13 text-ds-gray-900" role="status">
          Reset demo data?
        </span>
        <button
          ref={confirmRef}
          type="button"
          onClick={reset}
          disabled={loading}
          aria-busy={loading}
          className="btn-primary"
        >
          {loading ? <ButtonSpinner /> : null}
          Confirm Reset
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            triggerRef.current?.focus();
          }}
          disabled={loading}
          className="btn-secondary"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setConfirming(true)}
      disabled={loading}
      className="btn-secondary"
    >
      Reset Demo Data…
    </button>
  );
}
