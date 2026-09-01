import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PagerIconLink({
  href,
  label,
  children,
  className,
  labeled = false,
  shortcut,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
  className?: string;
  labeled?: boolean;
  shortcut?: string;
}) {
  const size = labeled ? "default" : "icon";
  const classes = cn(labeled ? "h-8 gap-2" : "size-8", className);
  const shortcutProps = shortcut
    ? ({ "aria-keyshortcuts": shortcut } as const)
    : {};

  if (href == null) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        className={classes}
        disabled
        aria-label={label}
        {...shortcutProps}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button variant="outline" size={size} className={classes} asChild>
      <Link
        href={href}
        scroll={false}
        aria-label={label}
        {...shortcutProps}
      >
        {children}
      </Link>
    </Button>
  );
}
