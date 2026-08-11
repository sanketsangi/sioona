import { GeistMaskIcon } from "@/components/icons/GeistMaskIcon";

type IconProps = { className?: string };

/** Geist `book-open` (Figma 1:879) — Guidance. */
export function BookOpenIcon({ className = "size-4 shrink-0" }: IconProps) {
  return <GeistMaskIcon src="/icons/book-open.svg" className={className} />;
}
