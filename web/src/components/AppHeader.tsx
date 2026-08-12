"use client";

import { useState } from "react";
import {
  ChartLineUp,
  ListChecks,
  LockSimple,
  Tag,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { EyeIcon } from "@/components/icons/EyeIcon";
import { EyeOffIcon } from "@/components/icons/EyeOffIcon";
import { SparklesIcon } from "@/components/icons/SparklesIcon";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { HeaderNotification } from "@/lib/notifications";
import type { PlatformView } from "@/lib/views";

const TITLE_ICONS: Partial<Record<PlatformView, Icon>> = {
  insights: ChartLineUp,
  eval: ListChecks,
  taxonomy: Tag,
};

type AppHeaderProps = {
  title?: string;
  activeView: PlatformView;
  detailOpen?: boolean;
  notifications?: HeaderNotification[];
};

type WorkspaceMode = "shadow" | "action";

/** Unlocked locally / via flag so you can design Action Mode; prod stays locked. */
function isActionModeUnlocked(): boolean {
  if (process.env.NEXT_PUBLIC_ACTION_MODE_UNLOCKED === "true") return true;
  return process.env.NODE_ENV === "development";
}

/**
 * Main-column header — sits parallel to the sidebar logo row.
 * Page title lives here for every view; logo/nav stay in the sidebar.
 * Desktop collapse lives beside the sidebar logo; a mobile-only trigger
 * remains here so the sheet can open when the sidebar is closed.
 */
export function AppHeader({
  title,
  activeView,
  detailOpen = false,
  notifications = [],
}: AppHeaderProps) {
  const TitleIcon =
    title && !detailOpen && activeView !== "upload"
      ? TITLE_ICONS[activeView]
      : null;
  const showUploadTitleIcon = Boolean(
    title && !detailOpen && activeView === "upload",
  );

  return (
    <header className="app-header">
      <div className="app-header-start flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger
          className="size-11 shrink-0 md:hidden"
          aria-label="Toggle navigation"
          title="Toggle navigation"
        />

        {title ? (
          <h1 className="flex min-w-0 items-center gap-2 text-balance text-heading-20 text-sio-fg-base">
            {showUploadTitleIcon ? (
              <ArrowCircleUpIcon className="size-5 shrink-0" />
            ) : TitleIcon ? (
              <TitleIcon
                className="size-5 shrink-0"
                weight="bold"
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 truncate">{title}</span>
          </h1>
        ) : null}
      </div>

      <div className="app-header-mode">
        <div className="pointer-events-auto">
          <ModeToggle />
        </div>
      </div>

      <div className="app-header-actions flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationsMenu notifications={notifications} />

        <button
          type="button"
          className="btn-secondary size-11 shrink-0 gap-1.5 px-0 md:size-9 lg:w-auto lg:px-3.5"
          aria-label="Export"
        >
          <ArrowCircleUpIcon className="size-3.5 shrink-0" />
          <span className="hidden lg:inline">Export</span>
        </button>

        <button
          type="button"
          className="btn-primary size-11 shrink-0 gap-1.5 px-0 md:size-9 lg:h-9 lg:w-auto lg:px-3.5"
          aria-label="Create Campaign"
        >
          <SparklesIcon className="size-3.5 shrink-0" />
          <span className="hidden lg:inline">Create Campaign</span>
        </button>
      </div>
    </header>
  );
}

function ModeToggle() {
  const unlocked = isActionModeUnlocked();
  const [mode, setMode] = useState<WorkspaceMode>("shadow");

  /* Stretch to parent h-11 / md:h-9 — do not set min-h-11 (overflows p-0.5). */
  const segmentClass =
    "relative z-[1] inline-flex h-full items-center justify-center gap-1 rounded-[5px] px-2 text-label-12 font-medium sm:px-2.5 sm:text-label-13";

  return (
    <div
      role="group"
      aria-label="Workspace mode"
      className="mode-toggle relative inline-grid h-11 max-w-full grid-cols-2 items-stretch rounded-sm border border-sio-border-base p-0.5 md:h-9"
    >
      <span
        className="mode-toggle-thumb pointer-events-none absolute inset-y-0.5 left-0.5 z-0 w-[calc(50%-0.125rem)] rounded-[5px] bg-sio-bg-interactive-hover"
        data-mode={mode}
        aria-hidden
      />

      <button
        type="button"
        aria-pressed={mode === "shadow"}
        onClick={() => setMode("shadow")}
        className={`${segmentClass} ${
          mode === "shadow"
            ? "text-sio-fg-base"
            : "text-sio-fg-muted hover:text-sio-fg-base"
        }`}
      >
        <EyeOffIcon className="size-3.5 shrink-0" />
        <span className="lg:hidden">Shadow</span>
        <span className="hidden lg:inline">Shadow Mode</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === "action"}
        disabled={!unlocked}
        aria-disabled={!unlocked}
        aria-label={unlocked ? "Action Mode" : "Action Mode (locked)"}
        title={unlocked ? "Action Mode" : "Action Mode (locked)"}
        onClick={() => {
          if (unlocked) setMode("action");
        }}
        className={`${segmentClass} ${
          mode === "action"
            ? "text-sio-fg-base"
            : "text-sio-fg-muted hover:text-sio-fg-base"
        } disabled:cursor-not-allowed disabled:hover:text-sio-fg-muted`}
      >
        <EyeIcon className="size-3.5 shrink-0" />
        <span className="lg:hidden">Action</span>
        <span className="hidden lg:inline">Action Mode</span>
        {!unlocked ? (
          <LockSimple className="size-3.5 shrink-0" weight="bold" aria-hidden />
        ) : null}
      </button>
    </div>
  );
}
