type IconProps = { className?: string };

/** Tenant brand mark — hemisphere/globe glyph. */
export function IconInnerShadowTop({
  className = "size-5 shrink-0 text-black",
}: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.8095 13.5C14.2386 13.0469 14.6152 12.5437 14.9297 12H1.07026C1.38476 12.5437 1.76141 13.0469 2.1905 13.5H13.8095ZM15.9381 9C15.851 9.69864 15.6738 10.3693 15.4185 11H0.581517C0.326218 10.3693 0.149013 9.69864 0.0618937 9H15.9381ZM15.9997 8.06438C15.9999 8.04294 16 8.02148 16 8C16 3.58172 12.4183 0 8 0C3.58172 0 0 3.58172 0 8H16L15.9997 8.06438ZM3.33528 14.5C4.64841 15.444 6.25928 16 8 16C9.74072 16 11.3516 15.444 12.6647 14.5H3.33528Z"
        fill="currentColor"
      />
    </svg>
  );
}
