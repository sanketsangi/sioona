export type StatusDotState =
  | "QUEUED"
  | "BUILDING"
  | "ERROR"
  | "READY"
  | "CANCELED";

type StatusDotProps = {
  /** geistcn deployment-style state. */
  state: StatusDotState;
  /** When true, show the human-readable label next to the dot. */
  label?: boolean;
  /** Visible label text when `label` is true. */
  children?: string;
  className?: string;
};

const STATE_CLASS: Record<StatusDotState, string> = {
  QUEUED: "status-dot-queued",
  BUILDING: "status-dot-building",
  ERROR: "status-dot-error",
  READY: "status-dot-ready",
  CANCELED: "status-dot-canceled",
};

/**
 * Local StatusDot primitive matching `@vercel/geistcn` StatusDot API.
 * geistcn is not on public npm — keep API-aligned for drop-in later.
 *
 * Usage: `<StatusDot label state="QUEUED">Pending</StatusDot>`
 */
export function StatusDot({
  state,
  label = false,
  children,
  className = "",
}: StatusDotProps) {
  return (
    <span
      className={`status-dot min-w-0 ${STATE_CLASS[state]} ${className}`}
    >
      <span className="status-dot-indicator" aria-hidden />
      {label && children ? (
        <span className="truncate">{children}</span>
      ) : null}
    </span>
  );
}
