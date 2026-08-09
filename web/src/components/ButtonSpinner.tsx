import { Loader2 } from "lucide-react";

/** Spinner for loading buttons — keep the original label beside this. */
export function ButtonSpinner({ className = "btn-spinner" }: { className?: string }) {
  return (
    <Loader2 className={className} strokeWidth={1.5} aria-hidden />
  );
}
