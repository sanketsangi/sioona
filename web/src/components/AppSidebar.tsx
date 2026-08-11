"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import {
  CaretDoubleLeft,
  ChartLineUp,
  ListChecks,
  Tag,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { BookOpenIcon } from "@/components/icons/BookOpenIcon";
import { LifebuoyIcon } from "@/components/icons/LifebuoyIcon";
import { UserIcon } from "@/components/icons/UserIcon";
import { SioonaLogotype } from "@/components/SioonaLogotype";
import { viewHref, type PlatformView } from "@/lib/views";

const nav: { view: PlatformView; label: string; icon: Icon | null }[] = [
  { view: "insights", label: "Insights", icon: ChartLineUp },
  { view: "upload", label: "Upload", icon: null },
  { view: "eval", label: "Eval", icon: ListChecks },
  { view: "taxonomy", label: "Taxonomy", icon: Tag },
];

const footerLinks: {
  label: string;
  Icon: typeof LifebuoyIcon | typeof BookOpenIcon;
}[] = [
  { label: "Help", Icon: LifebuoyIcon },
  { label: "Guidance", Icon: BookOpenIcon },
];

function NavLinks({
  activeView,
  detailOpen,
  onNavigate,
}: {
  activeView: PlatformView;
  detailOpen: boolean;
  onNavigate?: () => void;
}) {
  const activeIndex = detailOpen
    ? -1
    : nav.findIndex((item) => item.view === activeView);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-3">
      <p className="sidebar-nav-section" id="sidebar-nav-heading">
        Workspace
      </p>
      <nav
        aria-labelledby="sidebar-nav-heading"
        className="sidebar-nav sidebar-nav-animated"
        style={
          {
            "--sidebar-nav-index": Math.max(0, activeIndex),
          } as React.CSSProperties
        }
      >
        <span
          className="sidebar-nav-thumb"
          data-hidden={activeIndex < 0 ? "true" : undefined}
          aria-hidden
        />
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
              {Icon ? (
                <Icon className="size-4 shrink-0" weight="bold" aria-hidden />
              ) : (
                <ArrowCircleUpIcon className="size-4 shrink-0" />
              )}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="shrink-0 border-t border-sio-border-base p-3">
      <div className="sidebar-nav mb-1.5">
        {footerLinks.map((item) => {
          const { Icon } = item;
          return (
            <button
              key={item.label}
              type="button"
              className="sidebar-nav-link w-full"
              disabled
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="btn-secondary w-full justify-start gap-2.5 px-3"
        aria-label="Create Account"
      >
        <UserIcon className="size-4 shrink-0" />
        <span>Create Account</span>
      </button>
    </div>
  );
}

function SidebarLogo() {
  return (
    <div className="sidebar-logo-row">
      <Link
        href={viewHref("insights")}
        className="group inline-flex h-11 min-w-0 items-center rounded-md px-1.5 transition-opacity duration-150 hover:opacity-90 md:h-10"
        aria-label="Sioona"
        translate="no"
      >
        <SioonaLogotype height={32} />
      </Link>
    </div>
  );
}

function SidebarBody({
  activeView,
  detailOpen,
  onNavigate,
  showLogo = false,
}: {
  activeView: PlatformView;
  detailOpen: boolean;
  onNavigate?: () => void;
  showLogo?: boolean;
}) {
  return (
    <>
      {showLogo ? <SidebarLogo /> : null}
      <NavLinks
        activeView={activeView}
        detailOpen={detailOpen}
        onNavigate={onNavigate}
      />
      <SidebarFooter />
    </>
  );
}

export function AppSidebar({
  activeView,
  detailOpen = false,
  navOpen,
  onNavOpenChange,
  onCloseNav,
  menuTriggerRef,
}: {
  activeView: PlatformView;
  detailOpen?: boolean;
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  onCloseNav: () => void;
  menuTriggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  /** Read when the drawer opens, before pinning the body shifts the offset */
  const restoreScrollRef = useRef(0);
  const titleId = useId();
  const wasOpenRef = useRef(false);

  const close = onCloseNav;

  useEffect(() => {
    if (navOpen && !wasOpenRef.current) {
      restoreScrollRef.current = window.scrollY;
    }
    wasOpenRef.current = navOpen;
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;

    const scrollY = restoreScrollRef.current;
    const trigger = menuTriggerRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    const drawer = drawerRef.current;
    const focusables = drawer?.querySelectorAll<HTMLElement>(
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
    const rail = document.querySelector<HTMLElement>(".sidebar-rail");
    main?.setAttribute("inert", "");
    rail?.setAttribute("inert", "");

    document.body.style.top = `-${scrollY}px`;
    document.body.dataset.scrollLocked = "true";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onTab);
      main?.removeAttribute("inert");
      rail?.removeAttribute("inert");
      delete document.body.dataset.scrollLocked;
      document.body.style.top = "";
      void document.body.offsetHeight;
      window.scrollTo({ top: scrollY, behavior: "instant" });
      trigger?.focus({ preventScroll: true });
    };
  }, [navOpen, close, menuTriggerRef]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) onNavOpenChange(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onNavOpenChange]);

  return (
    <>
      {/* Desktop sidebar — logo row parallel to AppHeader; nav + footer below */}
      <aside
        className="sidebar-rail hidden w-[var(--sidebar-width)] shrink-0 flex-col md:flex"
        style={{ width: "var(--sidebar-width)" }}
      >
        <SidebarBody activeView={activeView} detailOpen={detailOpen} showLogo />
      </aside>

      {/* Mobile drawer */}
      {navOpen ? (
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
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sio-border-base px-3">
              <span id={titleId} className="min-w-0" translate="no">
                <SioonaLogotype height={28} />
              </span>
              <button
                type="button"
                className="btn-tertiary size-11 shrink-0 px-0"
                aria-label="Collapse"
                title="Collapse"
                onClick={close}
              >
                <CaretDoubleLeft className="size-5" weight="bold" aria-hidden />
              </button>
            </div>
            <SidebarBody
              activeView={activeView}
              detailOpen={detailOpen}
              onNavigate={close}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
