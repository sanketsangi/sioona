"use client";

import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { HeaderNotification } from "@/lib/notifications";
import type { PlatformView } from "@/lib/views";

export function AppShell({
  children,
  title,
  activeView,
  detailOpen = false,
  notifications = [],
}: {
  children: React.ReactNode;
  title?: string;
  activeView: PlatformView;
  detailOpen?: boolean;
  notifications?: HeaderNotification[];
}) {
  return (
    <SidebarProvider
      className="flex !min-h-0 h-dvh overflow-hidden bg-muted text-foreground"
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
        <AppHeader
          title={title}
          activeView={activeView}
          detailOpen={detailOpen}
          notifications={notifications}
        />

        {/* dashboard-01 main column: flex → @container/main → padded frame */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="@container/main flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="page-frame">
              <div className="page-body">{children}</div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
