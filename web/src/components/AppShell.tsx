"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { QueueWakeRetry } from "@/components/QueueWakeRetry";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { shouldWakeBackendFromNotifications } from "@/lib/backend-wake";
import { stopCursorRefStrip } from "@/lib/cursor-ref-hydration";
import type { AccountSurface } from "@/lib/account-surface";
import type { HeaderNotification } from "@/lib/notifications";
import type { PlatformView, WorkspaceMode } from "@/lib/views";

function ScopeChangeNotice() {
  const params = useSearchParams();
  if (params.get("scopeChanged") !== "1") return null;
  return <p role="status" className="shrink-0 px-4 pt-3 text-copy-14 text-sio-fg-subtle">Corpus changed. Signal selection and pagination were cleared; your filters were kept.</p>;
}

export function AppShell({
  children,
  title,
  lastUploadedFileName,
  headerBatchName,
  uploadedFileNames,
  chatCount,
  vaultFile = null,
  activeView,
  workspaceMode = "shadow",
  detailOpen = false,
  notifications = [],
  account = null,
  showDemoActions = true,
}: {
  children: React.ReactNode;
  title?: string;
  lastUploadedFileName?: string;
  /** Selected vault / keep-set name shown in the header breadcrumb. */
  headerBatchName?: string;
  /** Real-export files the sidebar and header can switch between. */
  uploadedFileNames?: string[];
  chatCount?: number;
  /** `?file=` vault scope — active pill on AppSidebar. */
  vaultFile?: string | null;
  activeView: PlatformView;
  workspaceMode?: WorkspaceMode;
  detailOpen?: boolean;
  notifications?: HeaderNotification[];
  /** Sidebar account. Null hides it (sign-in redirect). */
  account?: AccountSurface | null;
  /** Reset and Partner Demo. Off when production disables those actions. */
  showDemoActions?: boolean;
}) {
  useEffect(() => {
    stopCursorRefStrip();
  }, []);

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

      <AppSidebar
        activeView={activeView}
        detailOpen={detailOpen}
        lastUploadedFileName={lastUploadedFileName}
        vaultFile={vaultFile}
        uploadedFileNames={uploadedFileNames}
        chatCount={chatCount}
        account={account}
        showDemoActions={showDemoActions}
      />

      <SidebarInset
        id="main"
        tabIndex={-1}
        className="page-main min-h-0 overflow-hidden bg-muted"
      >
        <AppHeader
          title={title}
          lastUploadedFileName={headerBatchName ?? lastUploadedFileName}
          uploadedFileNames={uploadedFileNames}
          activeView={activeView}
          workspaceMode={workspaceMode}
          detailOpen={detailOpen}
          notifications={notifications}
        />
        <Suspense><ScopeChangeNotice /></Suspense>
        <QueueWakeRetry
          active={shouldWakeBackendFromNotifications(notifications)}
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
