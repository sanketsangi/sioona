"use client";

import { useEffect, useState } from "react";
import { XIcon } from "@/components/icons/XIcon";
import {
  INSIGHTS_SHADOW_TIP_COPY,
  isInsightsShadowTipDismissed,
  persistInsightsShadowTipDismissed,
} from "@/lib/insights-shadow-tip";
import { cn } from "@/lib/utils";

/**
 * First-paint Insights tip. Dismissed into localStorage (same pattern as
 * header notifications). Copy matches Help: review only, nothing sent.
 */
export function InsightsShadowTip({ className }: { className?: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (
      isInsightsShadowTipDismissed((key) => window.localStorage.getItem(key))
    ) {
      setVisible(false);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    persistInsightsShadowTipDismissed((key, value) => {
      window.localStorage.setItem(key, value);
    });
    setVisible(false);
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-[var(--radius-panel)] border border-sio-border-subtle bg-sio-bg-base px-3 py-2.5",
        className,
      )}
      role="status"
    >
      <p className="min-w-0 flex-1 text-pretty text-copy-14 text-sio-fg-subtle">
        {INSIGHTS_SHADOW_TIP_COPY}
      </p>
      <button
        type="button"
        className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-[var(--radius-control)] text-sio-fg-muted hover:bg-sio-bg-interactive hover:text-sio-fg-base focus-visible:shadow-[var(--focus-ring)] md:size-8"
        onClick={dismiss}
        aria-label="Dismiss Shadow Mode tip"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
