type IconProps = { className?: string };

/** Solid bolt / lightning — filled glyph, sized like sidebar icons (`size-4`). */
export function BoltIcon({ className = "size-4 shrink-0" }: IconProps) {
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
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M7.15708 0L2.33258 9.40776L1.77246 10.5H2.99995H6.99995C7.13802 10.5 7.24995 10.6119 7.24995 10.75V16H8.84282L13.6673 6.59224L14.2274 5.5H12.9999H8.99995C8.86188 5.5 8.74995 5.38807 8.74995 5.25V0H7.15708ZM6.99995 9H4.22743L7.24995 3.1061V5.25C7.24995 6.2165 8.03345 7 8.99995 7H11.7724L8.74995 12.8939V10.75C8.74995 9.7835 7.96645 9 6.99995 9Z"
      />
    </svg>
  );
}
