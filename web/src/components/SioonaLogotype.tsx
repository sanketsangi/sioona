type SioonaLogotypeProps = {
  height?: number;
  className?: string;
};

/**
 * Brand wordmark — uses former page-title type
 * (`text-heading-16 md:text-heading-20`).
 */
export function SioonaLogotype({
  height = 32,
  className,
}: SioonaLogotypeProps) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center text-sio-fg-base ${className ?? ""}`}
      style={{ height }}
      translate="no"
    >
      <span className="truncate text-heading-16 md:text-heading-20">
        Sioona
      </span>
    </span>
  );
}
