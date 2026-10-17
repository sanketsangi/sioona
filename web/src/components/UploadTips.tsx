import { cn } from "@/lib/utils";

export function UploadTips({ className }: { className?: string }) {
  return (
    <aside className={cn("mx-auto w-full max-w-5xl px-4 pt-4 text-copy-14", className)} aria-label="Upload preparation tips">
      <div className="panel p-4 text-sio-fg-subtle">
        <h3 className="text-sm font-semibold text-foreground">How to prepare your export</h3>
        <p className="mt-1 text-xs text-muted-foreground">Keep customer and agent messages together; inspect mapping before importing. Approving or copying drafts never sends customer messages.</p>
      </div>
    </aside>
  );
}
