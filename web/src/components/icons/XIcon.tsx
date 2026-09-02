type IconProps = { className?: string };

/** Geist X — filter-pill clear and popover close. */
export function XIcon({ className = "relative size-4 shrink-0" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      height="16"
      width="16"
      data-slot="geist-icon"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M11.56 5.5 9.06 8l2.5 2.5-1.06 1.06L8 9.06l-2.5 2.5-1.06-1.06L6.94 8l-2.5-2.5L5.5 4.44 8 6.94l2.5-2.5z"
      />
    </svg>
  );
}
