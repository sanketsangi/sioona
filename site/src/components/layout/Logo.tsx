import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Sioona, home"
      translate="no"
      className={`inline-flex min-h-8 items-center rounded-control text-heading-20 text-sio-fg-base ${className}`}
    >
      Sioona
    </Link>
  );
}
