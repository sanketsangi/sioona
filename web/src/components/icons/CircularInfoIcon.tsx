type IconProps = { className?: string };

/** Geist circular info — Note default glyph. */
export function CircularInfoIcon({
  className = "size-3.5 shrink-0 text-sio-fg-subtle",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      height="14"
      width="14"
      data-slot="geist-icon"
      data-glyph="circular"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16M6.25 7h1.5a1 1 0 0 1 1 1v4.25h-1.5V8.5h-1zM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2"
      />
    </svg>
  );
}
