import { Avatar } from "@/components/ui/Avatar";
import { initialsFromName } from "@/lib/format";

type SignalUserProps = {
  name: string;
  /** Avatar diameter in px. Default 28 (queue User column). */
  size?: number;
  className?: string;
  /** Show truncated display name beside the avatar. Default true. */
  showName?: boolean;
};

/**
 * Insights user chrome — Avatar initials + optional truncated name.
 * Letter falls back to "?" when name is empty or the placeholder "Customer".
 */
export function SignalUser({
  name,
  size = 28,
  className = "",
  showName = true,
}: SignalUserProps) {
  const trimmed = name.trim();
  const display = trimmed || "Customer";
  const letter =
    !trimmed || display === "Customer" ? "?" : initialsFromName(display);

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 ${className}`.trim()}
    >
      <Avatar letter={letter} placeholder size={size} />
      {showName ? (
        <span
          className="signal-user-name min-w-0 truncate text-label-13 font-medium text-sio-fg-base"
          translate="no"
        >
          {display}
        </span>
      ) : null}
    </span>
  );
}
