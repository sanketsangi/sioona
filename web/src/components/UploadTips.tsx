import { cn } from "@/lib/utils";

export function UploadTips({ className }: { className?: string }) {
  return <aside className={cn("mx-auto w-full max-w-5xl px-4 pt-3 text-copy-14 text-sio-fg-subtle", className)} aria-label="Upload help">
    <details><summary className="min-h-11 cursor-pointer py-3 focus-visible:shadow-[var(--focus-ring)]">How to prepare your export</summary>
      <p className="max-w-prose pb-3">Keep customer and agent messages together. Inspect the mapping before importing. Review detected signals against their stored conversation before approving a draft. Approval and copying never send a message.</p>
    </details>
  </aside>;
}
