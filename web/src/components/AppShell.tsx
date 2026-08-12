"use client";

import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
  return (
    <SidebarProvider
      className="flex !min-h-0 h-dvh overflow-hidden bg-background text-foreground"
      style={
        {
          "--sidebar-width": "240px",
          "--sidebar-width-icon": "3rem",
        } as React.CSSProperties
      }
    >
      <a
        href="#main"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-sm focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground focus:[clip:auto]"
      >
        Skip to content
      </a>

      <AppSidebar activeView={activeView} detailOpen={detailOpen} />

      <SidebarInset
        id="main"
        tabIndex={-1}
        className="page-main min-h-0 overflow-hidden bg-muted"
      >
        <AppHeader title={title} activeView={activeView} detailOpen={detailOpen} />

        <div className="page-frame flex min-h-0 flex-1 flex-col py-3 sm:py-4 lg:py-5">
          <div className="page-body">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
