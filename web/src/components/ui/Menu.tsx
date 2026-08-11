"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuId: string;
  triggerId: string;
  closeAndFocusTrigger: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(component: string): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error(`${component} must be used within MenuContainer`);
  }
  return ctx;
}

export function MenuContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuId = `${reactId}-menu`;
  const triggerId = `${reactId}-trigger`;

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(triggerId)?.focus();
    });
  }, [triggerId]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndFocusTrigger();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeAndFocusTrigger]);

  return (
    <MenuContext.Provider
      value={{ open, setOpen, menuId, triggerId, closeAndFocusTrigger }}
    >
      <div ref={rootRef} className={`relative inline-flex ${className}`}>
        {children}
      </div>
    </MenuContext.Provider>
  );
}

type MenuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  showChevron?: boolean;
  variant?: "secondary" | "primary" | "tertiary" | "unstyled";
  children: ReactNode;
};

export function MenuButton({
  showChevron = false,
  variant = "secondary",
  children,
  className = "",
  ...props
}: MenuButtonProps) {
  const { open, setOpen, menuId, triggerId } = useMenuContext("MenuButton");

  const variantClass =
    variant === "unstyled"
      ? "inline-flex items-center"
      : variant === "primary"
        ? "btn-primary"
        : variant === "tertiary"
          ? "btn-tertiary"
          : "btn-secondary";

  return (
    <button
      {...props}
      id={triggerId}
      type="button"
      className={`${variantClass} ${className}`.trim()}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={(e) => {
        props.onClick?.(e);
        if (!e.defaultPrevented) setOpen(!open);
      }}
    >
      {children}
      {showChevron ? (
        <CaretDown
          className={`size-3.5 shrink-0 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          weight="bold"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export function Menu({
  children,
  width = 200,
  className = "",
}: {
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  const { open, menuId, setOpen } = useMenuContext("Menu");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = listRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])'
    );
    items?.[0]?.focus();
  }, [open]);

  if (!open) return null;

  function focusItem(delta: number) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      ) ?? []
    );
    if (!items.length) return;
    const index = items.findIndex((el) => el === document.activeElement);
    const next =
      index < 0
        ? items[0]
        : items[(index + delta + items.length) % items.length];
    next?.focus();
  }

  return (
    <div
      ref={listRef}
      id={menuId}
      role="menu"
      style={{ width } as CSSProperties}
      className={`absolute start-0 top-[calc(100%+0.25rem)] z-40 max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain rounded-sm border border-sio-border-base bg-sio-bg-base py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          focusItem(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          focusItem(-1);
        } else if (e.key === "Home") {
          e.preventDefault();
          listRef.current
            ?.querySelector<HTMLElement>(
              '[role="menuitem"]:not([aria-disabled="true"])'
            )
            ?.focus();
        } else if (e.key === "End") {
          e.preventDefault();
          const items = listRef.current?.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"])'
          );
          items?.[items.length - 1]?.focus();
        } else if (e.key === "Tab") {
          setOpen(false);
        }
      }}
    >
      {children}
    </div>
  );
}

type MenuItemProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "default" | "error";
  prefix?: ReactNode;
  suffix?: ReactNode;
  active?: boolean;
  className?: string;
};

const itemClass =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium leading-5 text-sio-fg-base outline-none transition-colors duration-150 hover:bg-sio-bg-interactive-hover focus-visible:bg-sio-bg-interactive-hover";

export function MenuItem({
  children,
  href,
  onClick,
  disabled = false,
  type = "default",
  prefix,
  suffix,
  active = false,
  className = "",
}: MenuItemProps) {
  const { closeAndFocusTrigger } = useMenuContext("MenuItem");

  const tone =
    type === "error"
      ? "text-sio-status-danger-fg hover:bg-sio-status-danger-bg focus-visible:bg-sio-status-danger-bg"
      : active
        ? "bg-sio-bg-interactive-hover"
        : "";

  const content = (
    <>
      {prefix}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {suffix}
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        scroll={false}
        role="menuitem"
        aria-current={active ? "true" : undefined}
        className={`${itemClass} ${tone} ${className}`.trim()}
        onClick={() => closeAndFocusTrigger()}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-current={active ? "true" : undefined}
      className={`${itemClass} disabled:cursor-not-allowed disabled:text-sio-fg-muted disabled:hover:bg-transparent ${tone} ${className}`.trim()}
      onClick={() => {
        if (disabled) return;
        onClick?.();
        closeAndFocusTrigger();
      }}
    >
      {content}
    </button>
  );
}

export function MenuSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={title}>
      {title ? (
        <p className="px-3 pb-1 pt-2 text-label-12 font-medium tracking-[0.04em] text-sio-fg-muted uppercase">
          {title}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function MenuDivider() {
  return (
    <div
      role="separator"
      className="my-1 border-t border-sio-border-base"
      aria-hidden
    />
  );
}
