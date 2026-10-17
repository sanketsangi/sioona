"use client";

import Link from "next/link";
import { pilotContactHref } from "@/lib/pilot-contact";
import { useState } from "react";
import { X } from "@phosphor-icons/react/ssr";

const pill = "shrink-0 rounded-full border border-sio-border-subtle bg-sio-bg-muted px-2.5 py-0.5 text-label-12";

export function DemoWalkthrough({ reportHref }: { reportHref: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <nav aria-label="Demo walkthrough" className="flex shrink-0 items-center gap-2 overflow-x-auto py-1 text-sio-fg-subtle">
    <span className={pill}>1. Click a signal</span>
    <span className={pill}>2. Jump to source quote</span>
    <span className={pill}>3. Mark Correct <kbd>[C]</kbd></span>
    <Link className={`${pill} inline-flex min-h-11 items-center text-sio-fg-base hover:underline md:min-h-6`} href={reportHref}>4. Inspect Revenue Report →</Link>
    <a href={pilotContactHref()} className={`${pill} inline-flex min-h-11 items-center text-sio-fg-base hover:underline focus-visible:ring-2 focus-visible:ring-sio-border-base md:min-h-6`}>Request a pilot →</a>
    <button type="button" aria-label="Dismiss demo walkthrough" onClick={() => setDismissed(true)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-sio-bg-muted focus-visible:ring-2 focus-visible:ring-sio-border-base md:size-6"><X size={14} aria-hidden /></button>
  </nav>;
}
