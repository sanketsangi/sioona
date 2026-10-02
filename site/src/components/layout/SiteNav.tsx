"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, X } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/layout/Logo";
import { navLinks, siteConfig } from "@/lib/site";

const DRAWER_EXIT_MS = 200;

export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openDrawer = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    closingRef.current = false;
    dialog.removeAttribute("data-closing");
    dialog.showModal();
    document.documentElement.dataset.drawerOpen = "true";
    setOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.open || closingRef.current) return;
    closingRef.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dialog.setAttribute("data-closing", "true");
    window.setTimeout(
      () => {
        dialog.close();
        dialog.removeAttribute("data-closing");
        closingRef.current = false;
      },
      reduce ? 0 : DRAWER_EXIT_MS,
    );
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      delete document.documentElement.dataset.drawerOpen;
      setOpen(false);
    };
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeDrawer();
    };
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      delete document.documentElement.dataset.drawerOpen;
    };
  }, [closeDrawer]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches && dialogRef.current?.open) dialogRef.current.close();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 h-[var(--nav-height)]">
      <div
        aria-hidden
        data-scrolled={scrolled}
        className="pointer-events-none absolute inset-0 border-b border-sio-border-base bg-sio-bg-nav opacity-0 transition-opacity duration-200 ease-sio data-[scrolled=true]:opacity-100"
      />
      <div className="container-page relative flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-6">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link"
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href={siteConfig.appUrl} className="btn-tertiary hidden md:inline-flex">
            Sign In
          </Link>
          <Link href="/contact" className="btn-primary hidden sm:inline-flex">
            Request A Pilot
          </Link>
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open Menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="btn-secondary size-11 !px-0 md:hidden"
          >
            <List size={18} weight="bold" aria-hidden />
          </button>
        </div>
      </div>

      <dialog
        id="mobile-menu"
        ref={dialogRef}
        aria-label="Site menu"
        className="drawer"
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDrawer();
        }}
      >
        <div className="flex h-full flex-col px-4 pb-6 pt-3">
          <div className="flex h-11 items-center justify-between">
            <span className="eyebrow">Menu</span>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close Menu"
              className="btn-tertiary size-11 !px-0"
            >
              <X size={18} weight="bold" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobile" className="mt-4 flex flex-col">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeDrawer}
                aria-current={pathname === link.href ? "page" : undefined}
                className="flex min-h-12 items-center border-b border-sio-border-base text-heading-20 text-sio-fg-base"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Link href="/contact" onClick={closeDrawer} className="btn-primary btn-lg">
              Request A Pilot
            </Link>
            <Link href={siteConfig.appUrl} onClick={closeDrawer} className="btn-secondary btn-lg">
              Sign In
            </Link>
          </div>
        </div>
      </dialog>
    </header>
  );
}
