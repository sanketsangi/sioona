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
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-ds-background-100 text-ds-gray-1000 md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:inline-flex focus:h-11 focus:items-center focus:rounded-sm focus:bg-ds-gray-1000 focus:px-3.5 focus:text-sm focus:font-medium focus:text-ds-background-100 md:focus:h-9"
      >
        Skip to content
      </a>

      <AppSidebar activeView={activeView} detailOpen={detailOpen} />

      <main id="main" tabIndex={-1} className="page-main">
        <div className="page-frame flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip py-5 sm:py-6 lg:py-8">
          {(title || subtitle) && (
            <header className="page-header">
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
