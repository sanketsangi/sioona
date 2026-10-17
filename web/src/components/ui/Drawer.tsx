"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type DrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext(component: string): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error(`${component} must be used within Drawer`);
  }
  return ctx;
}

export function Drawer({
  children,
  open: openProp,
  onOpenChange,
  defaultOpen = false,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const reactId = useId();
  const titleId = `${reactId}-drawer-title`;
  const descriptionId = `${reactId}-drawer-desc`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoreScrollRef = useRef(0);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      restoreScrollRef.current = window.scrollY;
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const scrollY = restoreScrollRef.current;
    const trigger = triggerRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const panel = contentRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus({ preventScroll: true });

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !focusables?.length) return;
      const list = Array.from(focusables);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);

    const main = document.getElementById("main");
    main?.setAttribute("inert", "");

    document.body.style.top = `-${scrollY}px`;
    document.body.dataset.scrollLocked = "true";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onTab);
      main?.removeAttribute("inert");
      delete document.body.dataset.scrollLocked;
      document.body.style.top = "";
      void document.body.offsetHeight;
      window.scrollTo({ top: scrollY, behavior: "instant" });
      trigger?.focus({ preventScroll: true });
    };
  }, [open, setOpen]);

  return (
    <DrawerContext.Provider
      value={{ open, setOpen, titleId, descriptionId, triggerRef, contentRef }}
    >
      {children}
    </DrawerContext.Provider>
  );
}

export function DrawerTrigger({
  children,
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen, triggerRef } = useDrawerContext("DrawerTrigger");

  return (
    <button
      type="button"
      ref={triggerRef}
      className={className}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) setOpen(true);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function DrawerContent({
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  /** Prefer when no visible `DrawerTitle` — sets dialog name without aria-labelledby. */
  "aria-label"?: string;
}) {
  const { open, setOpen, titleId, descriptionId, contentRef } =
    useDrawerContext("DrawerContent");

  if (!open) return null;

  // Portal to body so AppShell / page-frame overflow + stacking cannot clip or bury the overlay.
  return createPortal(
    <div className="conversation-drawer-root">
      <button
        type="button"
        className="conversation-drawer-backdrop"
        aria-label="Close conversation"
        onClick={() => setOpen(false)}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        {...(ariaLabel
          ? { "aria-label": ariaLabel }
          : {
              "aria-labelledby": titleId,
              "aria-describedby": descriptionId,
            })}
        className={`conversation-drawer-panel ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DrawerTitle({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useDrawerContext("DrawerTitle");
  return (
    <h2
      id={titleId}
      className={`min-w-0 truncate text-heading-16 text-sio-fg-base ${className}`}
      {...props}
    >
      {children}
    </h2>
  );
}

export function DrawerDescription({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useDrawerContext("DrawerDescription");
  return (
    <p
      id={descriptionId}
      className={`min-w-0 truncate text-label-13 text-sio-fg-muted ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

export function DrawerFooter({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mt-auto flex shrink-0 flex-wrap gap-2 border-t border-sio-border-base px-1 py-3 sm:px-2 sm:py-3.5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DrawerClose({
  children,
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDrawerContext("DrawerClose");

  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
