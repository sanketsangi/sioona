"use client";

import { useCallback, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import type { PlatformView } from "@/lib/views";

export function AppShell({
  children,
  title,
  activeView,
  detailOpen = false,
}: {
  children: React.ReactNode;
  title?: string;
  activeView: PlatformView;
  detailOpen?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-sio-bg-subtle text-sio-fg-base md:flex-row">
      <a
        href="#main"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-sm focus:bg-sio-bg-inverse focus:px-3 focus:py-2 focus:text-sm focus:text-sio-fg-on-color focus:[clip:auto]"
      >
        Skip to content
      </a>

      <AppSidebar
        activeView={activeView}
        detailOpen={detailOpen}
        navOpen={navOpen}
        onNavOpenChange={setNavOpen}
        onCloseNav={closeNav}
        menuTriggerRef={menuTriggerRef}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppHeader
          title={title}
          activeView={activeView}
          detailOpen={detailOpen}
          navOpen={navOpen}
          onOpenNav={openNav}
          menuTriggerRef={menuTriggerRef}
        />

        <main id="main" tabIndex={-1} className="page-main">
          <div className="page-frame flex min-h-0 flex-1 flex-col py-3 sm:py-4 lg:py-5">
            <div className="page-body">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
