import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AvatarProps = {
  /** Initials or short letter mark when no children and no `src`. */
  letter?: string;
  /** Muted fill (geistcn letter-avatar / icon mode). */
  placeholder?: boolean;
  /** Width and height in px. Default 32. */
  size?: number;
  className?: string;
  /** Icon or custom mark (e.g. computer for Agent). Overrides letter. */
  children?: ReactNode;
  /** Photo URL. When set, fills the square and hides letter/children. */
  src?: string;
  /** Decorative when Avatar is `aria-hidden`; default empty. */
  alt?: string;
};

/**
 * Local Avatar primitive matching `@vercel/geistcn` Avatar letter API.
 * geistcn is not on public npm — keep API-aligned for drop-in later.
 *
 * Usage:
 * - `<Avatar letter="NS" placeholder size={32} />`
 * - `<Avatar placeholder size={28}><Desktop … /></Avatar>`
 * - `<Avatar src="/avatars/maya-chen.jpg" alt="" size={32} />`
 */
export function Avatar({
  letter,
  placeholder = false,
  size = 32,
  className = "",
  children,
  src,
  alt = "",
}: AvatarProps) {
  const text = (letter ?? "?").slice(0, 2);
  const showPhoto = Boolean(src);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-label-12 font-semibold",
        placeholder
          ? "bg-sio-bg-muted text-sio-fg-subtle"
          : "bg-sio-bg-subtle text-sio-fg-muted",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- public demo photo; decorative inside aria-hidden
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        (children ?? text)
      )}
    </span>
  );
}

/** Geistcn-aligned fallback alias — renders initials inside Avatar. */
export function AvatarFallback({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <span className={className}>{children}</span>;
}
