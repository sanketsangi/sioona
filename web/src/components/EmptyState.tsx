import type { ReactNode } from "react";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { cn } from "@/lib/utils";

/**
 * Shared empty / sparse chrome — icon well + Title Case heading + next step.
 * Use inside `.panel` / Card; do not invent a second empty pattern.
 */
export function EmptyState({
  title,
  description,
  icon,
  children,
  alert = false,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  alert?: boolean;
  className?: string;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-12",
        className,
      )}
    >
      <span
        className="mb-4 inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-sio-bg-muted text-sio-fg-subtle"
        aria-hidden
      >
        {icon ?? <LayersIcon className="size-4" />}
      </span>
      <p className="text-balance text-heading-16 text-sio-fg-base">{title}</p>
      {description ? (
        <div className="mt-2 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
          {typeof description === "string" ? <p>{description}</p> : description}
        </div>
      ) : null}
      {children}
    </div>
  );
}
