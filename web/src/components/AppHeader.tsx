"use client";

import { useState } from "react";
import {
  BellSimple,
  CaretDoubleLeft,
  Export,
  ListChecks,
  LockSimple,
  MegaphoneSimple,
  Pulse,
  Tag,
  UploadSimple,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { PlatformView } from "@/lib/views";

const TITLE_ICONS: Record<PlatformView, Icon> = {
  insights: Pulse,
  upload: UploadSimple,
  eval: ListChecks,
  taxonomy: Tag,
};

type AppHeaderProps = {
  title?: string;
  activeView: PlatformView;
  detailOpen?: boolean;
  navOpen?: boolean;
  onOpenNav?: () => void;
  menuTriggerRef?: React.RefObject<HTMLButtonElement | null>;
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
 */
export function AppHeader({
  title,
  activeView,
  detailOpen = false,
  navOpen = false,
  onOpenNav,
  menuTriggerRef,
}: AppHeaderProps) {
  const TitleIcon = title && !detailOpen ? TITLE_ICONS[activeView] : null;

  return (
    <header className="app-header">
      <div className="app-header-start flex min-w-0 flex-1 items-center gap-2">
        <button
          ref={menuTriggerRef}
          type="button"
          className="btn-tertiary size-11 shrink-0 px-0 md:hidden"
          aria-expanded={navOpen}
          aria-controls="app-sidebar-drawer"
          aria-label="Collapse"
          title="Collapse"
          onClick={onOpenNav}
        >
          <CaretDoubleLeft className="size-4" weight="bold" aria-hidden />
        </button>

        {title ? (
          <h1 className="flex min-w-0 items-center gap-2 text-balance text-heading-20 text-sio-fg-base">
            {TitleIcon ? (
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
        <button
          type="button"
          className="btn-secondary size-11 shrink-0 px-0 md:size-9"
          aria-label="Notifications"
        >
          <BellSimple className="size-4" weight="regular" aria-hidden />
        </button>

        <button
          type="button"
          className="btn-secondary size-11 shrink-0 gap-1.5 px-0 md:size-9 lg:w-auto lg:px-3.5"
          aria-label="Export"
        >
          <Export className="size-3.5 shrink-0" weight="regular" aria-hidden />
          <span className="hidden lg:inline">Export</span>
        </button>

        <button
          type="button"
          className="btn-primary size-11 shrink-0 gap-1.5 px-0 md:size-9 lg:h-9 lg:w-auto lg:px-3.5"
          aria-label="Create Campaign"
        >
          <MegaphoneSimple
            className="size-3.5 shrink-0"
            weight="bold"
            aria-hidden
          />
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
        <span className="lg:hidden">Action</span>
        <span className="hidden lg:inline">Action Mode</span>
        {!unlocked ? (
          <LockSimple className="size-3.5 shrink-0" weight="bold" aria-hidden />
        ) : null}
      </button>
    </div>
  );
}
