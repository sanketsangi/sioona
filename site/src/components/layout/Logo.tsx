import Link from "@/components/navigation/GuardedLink";
import { SioonaMark } from "@/components/layout/SioonaMark";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Sioona, home"
      translate="no"
      className={`inline-flex min-h-11 min-w-11 items-center gap-2 rounded-control text-sio-fg-base ${className}`}
    >
      <SioonaMark />
      <span className="text-heading-20">Sioona</span>
    </Link>
  );
}
