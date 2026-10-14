import Link from "@/components/navigation/GuardedLink";
import { SioonaMark } from "@/components/layout/SioonaMark";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Sioona, home"
      translate="no"
      className={`header-brand min-w-11 ${className}`}
    >
      <SioonaMark className="header-logo-mark" />
      <span className="header-wordmark">Sioona<span className="brand-signature-dot" aria-hidden>.</span></span>
    </Link>
  );
}
