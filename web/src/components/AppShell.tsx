import { AppSidebar } from "@/components/AppSidebar";
import type { PlatformView } from "@/lib/views";

export function AppShell({
  children,
  title,
  subtitle,
  activeView,
  detailOpen = false,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  activeView: PlatformView;
  detailOpen?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-sio-bg-subtle text-sio-fg-base md:flex-row">
      <a
        href="#main"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-sm focus:bg-sio-bg-inverse focus:px-3 focus:py-2 focus:text-sm focus:text-sio-fg-on-color focus:[clip:auto]"
      >
        Skip to content
      </a>

      <AppSidebar activeView={activeView} detailOpen={detailOpen} />

      <main id="main" tabIndex={-1} className="page-main">
        <div className="page-frame flex min-h-0 flex-1 flex-col py-6 sm:py-8 lg:py-10">
          {(title || subtitle) && (
            <header className="page-header shrink-0">
              {title ? <h1 className="page-header-title">{title}</h1> : null}
              {subtitle ? (
                <p className="page-header-subtitle">{subtitle}</p>
              ) : null}
            </header>
          )}
          <div className="page-body">{children}</div>
        </div>
      </main>
    </div>
  );
}
