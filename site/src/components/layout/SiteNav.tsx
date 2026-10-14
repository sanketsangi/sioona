"use client";
import { useReducedMotion } from "framer-motion";


import Link from "@/components/navigation/GuardedLink";
import { usePathname } from "next/navigation";
import { CaretDown, List, X, PlayCircle, PauseCircle } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Logo } from "@/components/layout/Logo";
import { navLinks, siteConfig } from "@/lib/site";

import { OutputPreview, WorkflowPreview, ScorePreview, FeaturePreview } from "@/components/layout/MenuPreviews";
import { usePageVisible } from "@/lib/usePageVisible";

const DRAWER_EXIT_MS = 200;
const productLinks = [
  { href: "/#product", label: "Product", description: "Find signals and choose your next action", eyebrow: "Conversation intelligence" },
  { href: "/#how", label: "Shadow Mode", description: "A simple loop. Humans in control.", eyebrow: "From chat to action" },
  { href: "/#score", label: "Signal Score", description: "Measure precision before you commit", eyebrow: "Signal Score" },
  { href: "/#features", label: "Product features", description: "Insights, uploads and your review toolkit", eyebrow: "Product features" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewRun, setPreviewRun] = useState(0);
  const pageVisible = usePageVisible();
  const reduced = useReducedMotion();
  const [workflowRun, setWorkflowRun] = useState(0);
  const [retainedPreviews, setRetainedPreviews] = useState<number[]>([]);
  const productRef = useRef<HTMLDivElement>(null);
  const productButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  const pendingHeaderScroll = useRef<string | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClose = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  };
  useEffect(() => () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
  }, []);

  const navigateHeader = (href: string) => {
    if (href.includes("#")) return;
    if (pathname === href) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } else {
      pendingHeaderScroll.current = href;
    }
  };

  useEffect(() => {
    if (pendingHeaderScroll.current !== pathname) return;
    pendingHeaderScroll.current = null;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  const selectProduct = (index: number) => {
    if (index === 1 && activeProduct !== 1) setWorkflowRun((value) => value + 1);
    setRetainedPreviews((previous) => [...new Set([...previous, activeProduct, index])]);
    setActiveProduct(index);
    if (index !== activeProduct) setPreviewPlaying(true);
  };

  // Keep outgoing artwork alive until its CSS fade completes. Cancel cleanup
  // when another interaction arrives so rapid switching and reopening work.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setRetainedPreviews(productOpen ? [activeProduct] : []);
      if (!productOpen) setPreviewPlaying(true);
    }, reduce ? 0 : 360);
    return () => window.clearTimeout(timer);
  }, [productOpen, activeProduct]);

  useEffect(() => {
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.dataset.navSentinel = "true";
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:9px;pointer-events:none;";
    document.body.prepend(sentinel);

    let sentinelHidden = false;
    const readScrolled = () => {
      const top = Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
      return top > 8 || sentinelHidden;
    };
    const publish = () => {
      const next = readScrolled();
      setScrolled((current) => (current === next ? current : next));
    };

    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      sentinelHidden = entry.intersectionRatio < 1;
      publish();
    }, { threshold: [0, 1] });
    observer?.observe(sentinel);

    let frame = 0;
    let ticks = 0;
    const followHash = () => {
      window.cancelAnimationFrame(frame);
      ticks = 0;
      const step = () => {
        publish();
        ticks += 1;
        if (ticks < 24) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    };

    publish();
    window.addEventListener("scroll", publish, { passive: true });
    document.addEventListener("scroll", publish, { capture: true, passive: true });
    window.addEventListener("scrollend", publish);
    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    if (window.location.hash) followHash();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", publish);
      document.removeEventListener("scroll", publish, true);
      window.removeEventListener("scrollend", publish);
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("popstate", followHash);
      observer?.disconnect();
      sentinel.remove();
    };
  }, [pathname]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!productRef.current?.contains(event.target as Node)) setProductOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  useEffect(() => {
    if (!productOpen) return;
    // WebKit pointer clicks may leave focus on the document rather than the menu.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setProductOpen(false);
      productButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [productOpen]);

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
        menuButtonRef.current?.focus();
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
      menuButtonRef.current?.focus();
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
    <header
      data-scrolled={scrolled ? "true" : "false"}
      className="sticky top-0 z-40 h-[var(--nav-height)] border-b border-transparent bg-transparent data-[scrolled=true]:border-sio-border-base data-[scrolled=true]:bg-sio-bg-base"
    >
      <div className="container-page site-nav-layout relative h-full items-center gap-4">
        <Logo />
        <nav
          aria-label="Primary"
          className="site-nav-links hidden items-center gap-1 md:flex"
        >
          <div ref={productRef} className="product-navigation" onPointerEnter={cancelHoverClose} onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            cancelHoverClose();
            hoverCloseTimer.current = setTimeout(() => setProductOpen(false), 180);
          }} onBlur={(event) => {
            // Switching previews can make the outgoing focused control inert.
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setProductOpen(false);
          }} onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setProductOpen(false);
              productButtonRef.current?.focus();
            }
          }}>
            <button ref={productButtonRef} type="button" className="nav-link product-trigger" aria-expanded={productOpen} aria-controls="product-navigation" onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              cancelHoverClose();
              if (!productOpen) {
                setPreviewRun((value) => value + 1);
                setRetainedPreviews((previous) => [...new Set([...previous, activeProduct])]);
                setPreviewPlaying(true);
                setProductOpen(true);
              }
            }} onClick={() => {
              if (!productOpen) setPreviewRun((value) => value + 1);
              setRetainedPreviews((previous) => [...new Set([...previous, activeProduct])]);
              setPreviewPlaying(true);
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
                {productLinks.map((link, index) => <div key={link.href} className="product-preview-content" data-preview-running={productOpen && previewPlaying && activeProduct === index && pageVisible && reduced !== true} data-active={activeProduct === index} aria-hidden={activeProduct !== index} inert={activeProduct !== index}>
                  <div className="product-preview-heading">
                    <span className="eyebrow">{link.eyebrow}</span>
                    <button
                      type="button"
                      className="menu-preview-playback"
                      aria-label={previewPlaying ? "Pause Menu Demo" : "Play Menu Demo"}
                      aria-pressed={previewPlaying}
                      onClick={() => setPreviewPlaying((value) => !value)}
                    >
                      {previewPlaying ? <PauseCircle size={18} aria-hidden /> : <PlayCircle size={18} aria-hidden />}
                    </button>
                  </div>
                  {(productOpen && activeProduct === index) || retainedPreviews.includes(index) ? <div className="product-preview-art" key={`${index}-${previewRun}`}>
                    {index === 0 ? <OutputPreview running={productOpen && previewPlaying && activeProduct === index && pageVisible && reduced !== true} /> : index === 1 ? <WorkflowPreview key={workflowRun} running={productOpen && previewPlaying && activeProduct === index && pageVisible && reduced !== true} /> : index === 2 ? <ScorePreview running={productOpen && previewPlaying && activeProduct === index && pageVisible && reduced !== true} /> : <FeaturePreview running={productOpen && previewPlaying && activeProduct === index && pageVisible && reduced !== true} />}
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
              onNavigate={() => navigateHeader(link.href)}
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
            Request a pilot
          </Link>
          <button
            type="button"
            ref={menuButtonRef}
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
                onNavigate={() => navigateHeader(link.href)}
                aria-current={pathname === link.href ? "page" : undefined}
                className="flex min-h-12 items-center border-b border-sio-border-base text-heading-20 text-sio-fg-base"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Link href="/contact" onClick={closeDrawer} className="btn-primary btn-lg rounded-full">
              Request a pilot
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
