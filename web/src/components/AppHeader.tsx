"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LockSimple, Tag } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { ChartLineUpIcon } from "@/components/icons/ChartLineUpIcon";
import { ListChecksIcon } from "@/components/icons/ListChecksIcon";
import { EyeOffIcon } from "@/components/icons/EyeOffIcon";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HeaderNotification } from "@/lib/notifications";
import {
  actionModeHref,
  isActionModeUnlocked,
  parseView,
  type PlatformView,
  type WorkspaceMode,
} from "@/lib/views";
import { cn } from "@/lib/utils";

const TITLE_ICONS: Partial<Record<PlatformView, Icon>> = {
  taxonomy: Tag,
};

type AppHeaderProps = {
  title?: string;
  lastUploadedFileName?: string;
  activeView: PlatformView;
  workspaceMode?: WorkspaceMode;
  detailOpen?: boolean;
  notifications?: HeaderNotification[];
};

/**
 * Main-column header — sits parallel to the sidebar logo row.
 * Page title lives here for every view; logo/nav stay in the sidebar.
 * Desktop collapse lives beside the sidebar logo; a mobile-only trigger
 * remains here so the sheet can open when the sidebar is closed.
 */
export function AppHeader({
  title,
  lastUploadedFileName,
  activeView,
  workspaceMode = "shadow",
  detailOpen = false,
  notifications = [],
}: AppHeaderProps) {
  const TitleIcon =
    title &&
    !detailOpen &&
    activeView !== "upload" &&
    activeView !== "insights" &&
    activeView !== "eval"
      ? TITLE_ICONS[activeView]
      : null;
  const showUploadTitleIcon = Boolean(
    title && !detailOpen && activeView === "upload",
  );
  const showInsightsTitleIcon = Boolean(
    title && !detailOpen && activeView === "insights",
  );
  const showEvalTitleIcon = Boolean(
    title && !detailOpen && activeView === "eval",
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
              {showInsightsTitleIcon ? (
                <ChartLineUpIcon className="size-5 shrink-0 text-sio-fg-base" />
              ) : showEvalTitleIcon ? (
                <ListChecksIcon className="size-5 shrink-0 text-sio-fg-base" />
              ) : showUploadTitleIcon ? (
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
          {title && lastUploadedFileName ? (
            <>
              <Separator
                orientation="vertical"
                className="h-4 w-px self-center bg-sio-border-strong data-[orientation=vertical]:h-4"
              />
              <Breadcrumb className="min-w-0">
                <BreadcrumbList className="min-w-0">
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage
                      className="min-w-0 truncate line-clamp-1"
                      title={lastUploadedFileName}
                      translate="no"
                    >
                      {lastUploadedFileName}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </>
          ) : null}
        </div>

        <div className="app-header-actions flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Suspense
            fallback={
              <ModeToggleFallback workspaceMode={workspaceMode} />
            }
          >
            <ModeToggle workspaceMode={workspaceMode} />
          </Suspense>
          <NotificationsMenu notifications={notifications} />
        </div>
      </div>
    </header>
  );
}

/** One Notifications-style outline; cells stay borderless; thumb is the selected fill. */
const modeTrackClass = cn(
  "relative isolate shrink-0 rounded-[var(--radius-control)] border border-sio-border-subtle bg-sio-bg-base",
  "shadow-[0_1px_1px_oklch(0_0_0_/_0.02)]",
);

const modeItemClass = cn(
  "relative z-[1] size-11 shrink-0 touch-manipulation rounded-none border-0 bg-transparent px-0",
  "inline-flex items-center justify-center text-sio-fg-subtle shadow-none outline-none transition-colors duration-150",
  "hover:bg-transparent hover:text-sio-fg-base",
  "focus-visible:z-10 focus-visible:border-transparent focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
  "data-[state=on]:border-0 data-[state=on]:bg-transparent data-[state=on]:font-medium data-[state=on]:text-sio-fg-base data-[state=on]:shadow-none",
  "group-data-[spacing=0]/toggle-group:px-0",
  "group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:first:rounded-l-[var(--radius-control)]",
  "group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:last:rounded-r-[var(--radius-control)]",
  "md:size-9",
);

const modeLinkClass = cn(
  modeItemClass,
  "first:rounded-l-[var(--radius-control)] last:rounded-r-[var(--radius-control)]",
);

const LOCKED_ACTION_ANNOUNCE = "Action Mode is locked";
const LOCKED_ACTION_TOOLTIP = "Action Mode is locked for now";
const MODE_TOOLTIP_DELAY_MS = 400;
const BOUNCE_HOLD_MS = 180;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function modeTrackStyle(mode: WorkspaceMode): CSSProperties {
  return {
    "--gap": 0,
    "--seg-count": 2,
    "--seg-index": mode === "action" ? 1 : 0,
    "--seg-pad": "0.125rem",
    "--seg-thumb-bg": "var(--sio-bg-interactive)",
    "--seg-thumb-radius": "calc(var(--radius-control) - 2px)",
  } as CSSProperties;
}

/** Shadow href = current query with `mode` stripped (keeps view/filters). */
function shadowModeHref(searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("mode");
  const view = parseView(params.get("view"));
  params.set("view", view);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/?view=insights";
}

function ModeToggleFallback({
  workspaceMode,
}: {
  workspaceMode: WorkspaceMode;
}) {
  return (
    <div
      className={cn(modeTrackClass, "flex w-fit flex-row items-center")}
      style={modeTrackStyle(workspaceMode)}
      aria-hidden
    >
      <span className="segmented-tabs-thumb" aria-hidden />
      <span className={modeLinkClass} />
      <span className={modeLinkClass} />
    </div>
  );
}

function ModeToggle({ workspaceMode }: { workspaceMode: WorkspaceMode }) {
  const unlocked = isActionModeUnlocked();
  const searchParams = useSearchParams();
  const shadowHref = useMemo(
    () => shadowModeHref(searchParams),
    [searchParams],
  );
  const actionHref = useMemo(
    () =>
      actionModeHref({
        scoreFrom: searchParams.get("scoreFrom"),
        demo: searchParams.get("demo"),
      }),
    [searchParams],
  );

  /** UI selection; when locked, Action is only shown briefly then reverts. */
  const [mode, setMode] = useState<WorkspaceMode>(workspaceMode);
  const [prevWorkspaceMode, setPrevWorkspaceMode] = useState(workspaceMode);
  const [bounceAction, setBounceAction] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
      if (liveClearRef.current) clearTimeout(liveClearRef.current);
    };
  }, []);

  if (workspaceMode !== prevWorkspaceMode) {
    setPrevWorkspaceMode(workspaceMode);
    setMode(workspaceMode);
  }

  function clearBounceTimers() {
    if (bounceTimerRef.current) {
      clearTimeout(bounceTimerRef.current);
      bounceTimerRef.current = null;
    }
    if (liveClearRef.current) {
      clearTimeout(liveClearRef.current);
      liveClearRef.current = null;
    }
  }

  function bounceBackToShadow() {
    clearBounceTimers();
    setMode("action");
    setLiveMessage(LOCKED_ACTION_ANNOUNCE);
    const reduced = prefersReducedMotion();
    setBounceAction(false);
    if (!reduced) {
      requestAnimationFrame(() => setBounceAction(true));
    }

    const holdMs = reduced ? 0 : BOUNCE_HOLD_MS;
    bounceTimerRef.current = setTimeout(() => {
      setMode("shadow");
      setBounceAction(false);
      bounceTimerRef.current = null;
    }, holdMs);

    liveClearRef.current = setTimeout(() => {
      setLiveMessage("");
      liveClearRef.current = null;
    }, Math.max(holdMs + 400, 800));
  }

  if (unlocked) {
    return (
      <TooltipProvider delayDuration={MODE_TOOLTIP_DELAY_MS}>
        <div className="relative shrink-0">
          <div
            role="group"
            aria-label="Workspace mode"
            className={cn(modeTrackClass, "flex w-fit flex-row items-center")}
            style={modeTrackStyle(workspaceMode)}
          >
            <span className="segmented-tabs-thumb" aria-hidden />
            <ModeToggleLink
              href={shadowHref}
              active={workspaceMode === "shadow"}
              tooltip="Shadow Mode"
              aria-label="Shadow Mode"
            >
              <EyeOffIcon className="size-4 shrink-0" />
            </ModeToggleLink>
            <ModeToggleLink
              href={actionHref}
              active={workspaceMode === "action"}
              tooltip="Action Mode"
              aria-label="Action Mode"
            >
              <PlayCircleIcon className="size-4 shrink-0" />
            </ModeToggleLink>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={MODE_TOOLTIP_DELAY_MS}>
      <div className="relative shrink-0">
        <ToggleGroup
          type="single"
          variant="default"
          size="lg"
          value={mode}
          onValueChange={(next) => {
            if (!next) return;
            if (next === "action") {
              bounceBackToShadow();
              return;
            }
            clearBounceTimers();
            setBounceAction(false);
            setLiveMessage("");
            setMode("shadow");
          }}
          aria-label="Workspace mode"
          spacing={0}
          className={modeTrackClass}
          style={modeTrackStyle(mode)}
        >
          <span className="segmented-tabs-thumb" aria-hidden />
          <ModeToggleItem
            value="shadow"
            tooltip="Shadow Mode"
            aria-label="Shadow Mode"
          >
            <EyeOffIcon className="size-4 shrink-0" />
          </ModeToggleItem>
          <ModeToggleItem
            value="action"
            tooltip={
              <>
                <LockSimple
                  className="size-3 shrink-0"
                  weight="bold"
                  aria-hidden
                />
                {LOCKED_ACTION_TOOLTIP}
              </>
            }
            aria-label={LOCKED_ACTION_TOOLTIP}
            aria-disabled
            bounce={bounceAction}
          >
            <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
              <PlayCircleIcon className="size-4 shrink-0 text-sio-fg-muted" />
              <LockSimple
                className="absolute -bottom-0.5 -right-1 size-2.5 text-sio-fg-base"
                weight="fill"
                aria-hidden
              />
            </span>
          </ModeToggleItem>
        </ToggleGroup>
        <p className="sr-only" aria-live="polite">
          {liveMessage || null}
        </p>
      </div>
    </TooltipProvider>
  );
}

function ModeToggleLink({
  href,
  active,
  tooltip,
  "aria-label": ariaLabel,
  children,
}: {
  href: string;
  active: boolean;
  tooltip: ReactNode;
  "aria-label": string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          scroll={false}
          aria-label={ariaLabel}
          aria-current={active ? "page" : undefined}
          className={cn(
            modeLinkClass,
            active && "font-medium text-sio-fg-base",
          )}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function ModeToggleItem({
  value,
  tooltip,
  bounce,
  "aria-label": ariaLabel,
  "aria-disabled": ariaDisabled,
  children,
}: {
  value: WorkspaceMode;
  tooltip: ReactNode;
  bounce?: boolean;
  "aria-label": string;
  "aria-disabled"?: boolean | "true" | "false";
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem
          value={value}
          aria-label={ariaLabel}
          aria-disabled={ariaDisabled}
          className={cn(
            modeItemClass,
            bounce && "mode-toggle-bounce",
            ariaDisabled && "cursor-not-allowed",
          )}
        >
          {children}
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="flex items-center gap-1.5">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
