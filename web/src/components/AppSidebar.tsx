"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  ClipboardCheck,
  LogIn,
  Menu,
  Tags,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { SioonaLogotype } from "@/components/SioonaLogotype";
import { viewHref, type PlatformView } from "@/lib/views";

const nav: { view: PlatformView; label: string; icon: LucideIcon }[] = [
  { view: "insights", label: "Insights", icon: Activity },
  { view: "upload", label: "Upload", icon: Upload },
  { view: "eval", label: "Eval", icon: ClipboardCheck },
  { view: "taxonomy", label: "Taxonomy", icon: Tags },
];

function LogoLockup({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href={viewHref("insights")}
      onClick={onNavigate}
      className="group inline-flex h-11 min-w-0 items-center rounded-md px-1.5 transition-opacity duration-150 hover:opacity-90 md:h-10"
      aria-label="Sioona"
      translate="no"
    >
      <SioonaLogotype height={32} />
    </Link>
  );
}

function NavLinks({
  activeView,
  detailOpen,
  onNavigate,
}: {
  activeView: PlatformView;
  detailOpen: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-1">
      <p className="sidebar-nav-section" id="sidebar-nav-heading">
        Workspace
      </p>
      <nav
        aria-labelledby="sidebar-nav-heading"
        className="sidebar-nav"
      >
        {nav.map((item) => {
          const active = activeView === item.view && !detailOpen;
          const Icon = item.icon;
          return (
            <Link
              key={item.view}
              href={viewHref(item.view)}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`sidebar-nav-link ${active ? "sidebar-nav-link-active" : ""}`}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function SignInFooter() {
  return (
    <div className="shrink-0 border-t border-ds-gray-400 p-3">
      <button
        type="button"
        className="sidebar-sign-in"
        disabled
      >
        <LogIn className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        Sign In
      </button>
    </div>
  );
}

function SidebarBody({
  activeView,
  detailOpen,
  onNavigate,
  headerEnd,
}: {
  activeView: PlatformView;
  detailOpen: boolean;
  onNavigate?: () => void;
  headerEnd?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-3 md:h-16">
        <div className="min-w-0 flex-1">
          <LogoLockup onNavigate={onNavigate} />
        </div>
        {headerEnd}
      </div>
      <NavLinks
        activeView={activeView}
        detailOpen={detailOpen}
        onNavigate={onNavigate}
      />
      <SignInFooter />
    </>
  );
}

export function AppSidebar({
  activeView,
  detailOpen = false,
}: {
  activeView: PlatformView;
  detailOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Read when the drawer opens, before pinning the body shifts the offset */
  const restoreScrollRef = useRef(0);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  const openDrawer = useCallback(() => {
    restoreScrollRef.current = window.scrollY;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const scrollY = restoreScrollRef.current;
    const trigger = triggerRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    const drawer = drawerRef.current;
    const focusables = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    // Mark background content inert while the drawer is open
    const main = document.getElementById("main");
    const rail = document.querySelector<HTMLElement>(".sidebar-rail");
    const bar = document.querySelector<HTMLElement>(".sidebar-mobile-bar");
    main?.setAttribute("inert", "");
    rail?.setAttribute("inert", "");
    bar?.setAttribute("inert", "");

    document.body.style.top = `-${scrollY}px`;
    document.body.dataset.scrollLocked = "true";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onTab);
      main?.removeAttribute("inert");
      rail?.removeAttribute("inert");
      bar?.removeAttribute("inert");
      delete document.body.dataset.scrollLocked;
      document.body.style.top = "";
      // Flush layout so the document is scrollable again before restoring
      void document.body.offsetHeight;
      window.scrollTo({ top: scrollY, behavior: "instant" });
      trigger?.focus({ preventScroll: true });
    };
  }, [open, close]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="sidebar-rail hidden w-[var(--sidebar-width)] shrink-0 flex-col md:flex"
        style={{ width: "var(--sidebar-width)" }}
      >
        <SidebarBody activeView={activeView} detailOpen={detailOpen} />
      </aside>

      {/* Mobile top bar */}
      <div className="sidebar-mobile-bar flex shrink-0 items-center gap-1 md:hidden">
        <button
          ref={triggerRef}
          type="button"
          className="btn-tertiary size-11 shrink-0 px-0"
          aria-expanded={open}
          aria-controls="app-sidebar-drawer"
          onClick={openDrawer}
        >
          <Menu className="size-5" strokeWidth={1.5} aria-hidden />
          <span className="sr-only">Open navigation</span>
        </button>
        <LogoLockup />
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="md:hidden">
          <button
            type="button"
            className="sidebar-drawer-backdrop"
            aria-label="Close navigation"
            onClick={close}
          />
          <aside
            ref={drawerRef}
            id="app-sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="sidebar-drawer"
          >
            <span id={titleId} className="sr-only">
              Navigation
            </span>
            <SidebarBody
              activeView={activeView}
              detailOpen={detailOpen}
              onNavigate={close}
              headerEnd={
                <button
                  type="button"
                  className="btn-tertiary size-11 shrink-0 px-0"
                  onClick={close}
                >
                  <X className="size-5" strokeWidth={1.5} aria-hidden />
                  <span className="sr-only">Close navigation</span>
                </button>
              }
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
