import { cn } from "@/lib/utils";

/**
 * Shared main-column view wrapper — dashboard-01 `@container/main` stacking
 * rhythm without demo chrome. Use inside AppShell `page-body`.
 */
export function ViewFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "@container/main flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden md:gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * In-page section header — title left, filters/actions right.
 * Matches Insights list + review toolbars.
 */
export function PageToolbar({
  children,
  actions,
  className,
}: {
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-toolbar", className)}>
      <div className="page-toolbar-start">{children}</div>
      {actions ? (
        <div className="page-toolbar-actions">{actions}</div>
      ) : null}
    </div>
  );
}
