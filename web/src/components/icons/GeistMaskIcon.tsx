type GeistMaskIconProps = {
  src: string;
  className?: string;
};

/** Masked Geist SVG from `public/icons/` so fill follows `currentColor`. */
export function GeistMaskIcon({
  src,
  className = "size-4 shrink-0",
}: GeistMaskIconProps) {
  return (
    <span
      className={`bg-current [mask-image:var(--geist-icon)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:var(--geist-icon)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain] ${className}`}
      style={{ ["--geist-icon" as string]: `url(${src})` }}
      aria-hidden
    />
  );
}
