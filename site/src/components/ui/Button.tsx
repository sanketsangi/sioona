import Link from "@/components/navigation/GuardedLink";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "tertiary";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  tertiary: "btn-tertiary",
};

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  large?: boolean;
  className?: string;
  children: ReactNode;
};

/** Real `<a>` navigation styled as a button (supports Cmd/Ctrl/middle-click). */
export function ButtonLink({
  variant = "primary",
  large = false,
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      {...props}
      className={`${variantClass[variant]} ${large ? "btn-lg" : ""} ${className}`.trim()}
    >
      {children}
    </Link>
  );
}
