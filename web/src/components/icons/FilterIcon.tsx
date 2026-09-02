type IconProps = { className?: string };

/** Geist filter bars (sliders) — Insights Add Filter trigger. */
export function FilterIcon({ className = "size-4 shrink-0" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 2h14v1.5H1zm4 10h6v1.5H5zM3.75 7H3v1.5h10V7H3.75"
      />
    </svg>
  );
}
