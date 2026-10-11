"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDown, List, X } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Logo } from "@/components/layout/Logo";
import { navLinks, siteConfig } from "@/lib/site";

import { OutputPreview, WorkflowPreview, ScorePreview, FeaturePreview } from "@/components/layout/MenuPreviews";

const DRAWER_EXIT_MS = 200;
const productLinks = [
  { href: "/#product", label: "Product", description: "Find signals and choose your next action", eyebrow: "Conversation intelligence" },
  { href: "/#how", label: "Shadow Mode", description: "A simple loop. Humans in control.", eyebrow: "From chat to action" },
  { href: "/#score", label: "Signal Score", description: "Measure precision before you commit", eyebrow: "Signal Score" },
  { href: "/#features", label: "Product Feature", description: "Insights, uploads and your review toolkit", eyebrow: "Product Feature" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState(0);
  const [workflowRun, setWorkflowRun] = useState(0);
  const [retainedPreviews, setRetainedPreviews] = useState<number[]>([]);
  const productRef = useRef<HTMLDivElement>(null);
  const productButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);

  const selectProduct = (index: number) => {
    if (index === 1 && activeProduct !== 1) setWorkflowRun((value) => value + 1);
    setRetainedPreviews((previous) => [...new Set([...previous, activeProduct, index])]);
    setActiveProduct(index);
  };

  // Keep outgoing artwork alive until its CSS fade completes. Cancel cleanup
  // when another interaction arrives so rapid switching and reopening work.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setRetainedPreviews(productOpen ? [activeProduct] : []);
    }, reduce ? 0 : 360);
    return () => window.clearTimeout(timer);
  }, [productOpen, activeProduct]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!productRef.current?.contains(event.target as Node)) setProductOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
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
      <div className="container-page site-nav-layout relative h-full items-center gap-4">
        <Logo />
        <nav
          aria-label="Primary"
          className="site-nav-links hidden items-center gap-1 md:flex"
        >
          <div ref={productRef} className="product-navigation" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProductOpen(false);
          }} onKeyDown={(event) => {
            if (event.key === "Escape") {
              setProductOpen(false);
              productButtonRef.current?.focus();
            }
          }}>
            <button ref={productButtonRef} type="button" className="nav-link product-trigger" aria-expanded={productOpen} aria-controls="product-navigation" onClick={() => {
              setRetainedPreviews((previous) => [...new Set([...previous, activeProduct])]);
              setProductOpen(!productOpen);
            }}>
              Product <CaretDown size={14} aria-hidden />
            </button>
            <div id="product-navigation" className="product-dropdown" data-open={productOpen} inert={!productOpen}>
              <div className="product-menu-column">
                <span className="eyebrow">Explore Sioona</span>
                <div className="product-menu-items" style={{ "--active-item": activeProduct } as CSSProperties}>
                  <div className="product-menu-indicator" aria-hidden />
                  {productLinks.map((link, index) => <Link key={link.href} href={link.href}
                    onPointerEnter={() => selectProduct(index)} onFocus={() => selectProduct(index)}
                    onClick={() => setProductOpen(false)} data-active={activeProduct === index}
                    className="product-dropdown-link">
                    <span className="product-menu-copy"><strong>{link.label}</strong><small>{link.description}</small></span>
                  </Link>)}
                </div>
              </div>
              <div className="product-preview" role="group" aria-label="Product preview">
                {productLinks.map((link, index) => <div key={link.href} className="product-preview-content" data-active={activeProduct === index} aria-hidden={activeProduct !== index} inert={activeProduct !== index}>
                  <span className="eyebrow">{link.eyebrow}</span>
                  {(productOpen && activeProduct === index) || retainedPreviews.includes(index) ? <div className="product-preview-art" key={`${index}-open`}>
                    {index === 0 ? <OutputPreview /> : index === 1 ? <WorkflowPreview key={workflowRun} /> : index === 2 ? <ScorePreview /> : <FeaturePreview />}
                  </div> : null}
                </div>)}
              </div>
            </div>
          </div>
          {navLinks.filter((link) => link.label !== "Product").map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              onClick={() => setProductOpen(false)}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-nav-actions flex shrink-0 items-center justify-end gap-2">
          {siteConfig.appUrl ? <Link href={siteConfig.appUrl} className="btn-tertiary hidden lg:inline-flex">
            Sign In
          </Link> : null}
          <Link href="/contact" className="btn-primary hidden rounded-full sm:inline-flex">
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
            <Link href="/contact" onClick={closeDrawer} className="btn-primary btn-lg rounded-full">
              Request A Pilot
            </Link>
            {siteConfig.appUrl ? <Link href={siteConfig.appUrl} onClick={closeDrawer} className="btn-secondary btn-lg">
              Sign In
            </Link> : null}
          </div>
        </div>
      </dialog>
    </header>
  );
}
