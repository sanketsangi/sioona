type SioonaLogotypeProps = {
  height?: number;
  className?: string;
};

/** Wordmark lockup — mark + Sioona name. */
export function SioonaLogotype({
  height = 32,
  className,
}: SioonaLogotypeProps) {
  const mark = Math.round(height * 0.75);
  const wordSize = Math.round(height * 0.47);

  return (
    <span
      className={`inline-flex items-center gap-2.5 text-ds-gray-1000 ${className ?? ""}`}
      style={{ height }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[6px] bg-ds-gray-1000 font-semibold text-ds-background-100"
        style={{
          width: mark,
          height: mark,
          fontSize: Math.round(mark * 0.52),
          lineHeight: 1,
        }}
        aria-hidden
      >
        S
      </span>
      <span
        className="truncate font-semibold tracking-[-0.04em]"
        style={{ fontSize: wordSize, lineHeight: 1 }}
        translate="no"
      >
        Sioona
      </span>
    </span>
  );
}
