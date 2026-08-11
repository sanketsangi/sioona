type AvatarProps = {
  /** Initials or short letter mark shown on the placeholder surface. */
  letter?: string;
  /** Muted fill with letter (geistcn letter-avatar mode). */
  placeholder?: boolean;
  /** Width and height in px. Default 32. */
  size?: number;
  className?: string;
};

/**
 * Local Avatar primitive matching `@vercel/geistcn` Avatar letter API.
 * geistcn is not on public npm — keep API-aligned for drop-in later.
 *
 * Usage: `<Avatar letter="NS" placeholder size={32} />`
 */
export function Avatar({
  letter,
  placeholder = false,
  size = 32,
  className = "",
}: AvatarProps) {
  const text = (letter ?? "?").slice(0, 2);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-label-12 font-semibold ${
        placeholder
          ? "bg-sio-bg-muted text-sio-fg-subtle"
          : "bg-sio-bg-subtle text-sio-fg-muted"
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {text}
    </span>
  );
}
