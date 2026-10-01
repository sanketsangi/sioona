"use client";

import { useState } from "react";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";

/**
 * Insights list header CTA — same PartnerDemoButton as Upload.
 * Always runs Zerodha_batch_02 (`POST /api/store` action `partner_demo`);
 * `lastUploadedFileName` only skips wipe when that pack is already active.
 */
export function InsightsPartnerDemoAction({
  lastUploadedFileName,
}: {
  lastUploadedFileName?: string | null;
}) {
  const [demoError, setDemoError] = useState<string | null>(null);

  return (
    <div className="relative flex min-w-0 shrink-0 flex-col items-stretch gap-2 sm:items-end">
      <PartnerDemoButton
        label="Run Partner Demo"
        lastUploadedFileName={lastUploadedFileName}
        className="btn-secondary rounded-[var(--radius-panel)] !h-9 !px-3.5"
        onErrorChange={setDemoError}
      />
      {demoError ? (
        <div className="status-banner status-banner-warning max-w-sm" role="alert">
          <p className="text-copy-14 text-sio-fg-base" aria-live="polite">
            {demoError}. Try again.
          </p>
        </div>
      ) : null}
    </div>
  );
}
