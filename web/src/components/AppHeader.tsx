"use client";

import { useState, type ReactNode } from "react";
import {
  ChartLineUp,
  ListChecks,
  LockSimple,
  Tag,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { EyeOffIcon } from "@/components/icons/EyeOffIcon";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { SparklesIcon } from "@/components/icons/SparklesIcon";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HeaderNotification } from "@/lib/notifications";
import type { PlatformView } from "@/lib/views";
import { cn } from "@/lib/utils";

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
      <div className="app-header-inner">
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

        <div className="app-header-actions flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ModeToggle />
          <NotificationsMenu notifications={notifications} />

          {/* Dead Action Mode chrome — desktop only so phone reviewers keep header clear. */}
          <button
            type="button"
            className="btn-secondary hidden size-9 shrink-0 gap-1.5 px-0 lg:inline-flex lg:w-auto lg:px-3.5"
            aria-label="Export"
            disabled
            title="Export (coming later)"
          >
            <ArrowCircleUpIcon className="size-3.5 shrink-0" />
            <span>Export</span>
          </button>

          <button
            type="button"
            className="btn-primary hidden size-9 shrink-0 gap-1.5 px-0 disabled:bg-sio-bg-inverse disabled:text-sio-fg-on-color lg:inline-flex lg:h-9 lg:w-auto lg:px-3.5"
            aria-label="Create Campaign"
            disabled
            title="Create Campaign (coming later)"
          >
            <SparklesIcon className="size-3.5 shrink-0" />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>
    </header>
  );
}

const modeItemClass =
  "size-11 min-w-11 px-0 md:size-9 md:min-w-9 disabled:pointer-events-none";

function ModeToggle() {
  const unlocked = isActionModeUnlocked();
  const [mode, setMode] = useState<WorkspaceMode>("shadow");

  return (
    <TooltipProvider delayDuration={0}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="lg"
        spacing={0}
        value={mode}
        onValueChange={(next) => {
          if (!next) return;
          if (next === "action" && !unlocked) return;
          setMode(next as WorkspaceMode);
        }}
        aria-label="Workspace mode"
        className="shrink-0"
      >
        <ModeToggleItem
          value="shadow"
          tooltip="Shadow Mode"
          aria-label="Shadow Mode"
        >
          <EyeOffIcon className="size-3.5 shrink-0" />
        </ModeToggleItem>
        <ModeToggleItem
          value="action"
          tooltip={unlocked ? "Action Mode" : "Action Mode (locked)"}
          aria-label={unlocked ? "Action Mode" : "Action Mode (locked)"}
          disabled={!unlocked}
        >
          <PlayCircleIcon className="size-3.5 shrink-0" />
          {!unlocked ? (
            <LockSimple
              className="size-3 shrink-0"
              weight="bold"
              aria-hidden
            />
          ) : null}
        </ModeToggleItem>
      </ToggleGroup>
    </TooltipProvider>
  );
}

function ModeToggleItem({
  value,
  tooltip,
  disabled,
  "aria-label": ariaLabel,
  children,
}: {
  value: WorkspaceMode;
  tooltip: string;
  disabled?: boolean;
  "aria-label": string;
  children: ReactNode;
}) {
  const item = (
    <ToggleGroupItem
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        modeItemClass,
        disabled && "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {children}
    </ToggleGroupItem>
  );

  /* Match SidebarMenuButton: label lives in tooltip only (icon control). */
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span className="inline-flex">{item}</span>
        ) : (
          item
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
