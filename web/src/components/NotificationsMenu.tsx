"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BellIcon } from "@/components/icons/BellIcon";
import { BoltIcon } from "@/components/icons/BoltIcon";
import { CheckCircleIcon } from "@/components/icons/CheckCircleIcon";
import { ExternalIcon } from "@/components/icons/ExternalIcon";
import { RefreshClockwiseIcon } from "@/components/icons/RefreshClockwiseIcon";
import { SparklesIcon } from "@/components/icons/SparklesIcon";
import { WarningIcon } from "@/components/icons/WarningIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NOTIFICATION_AUTO_OPEN_HOLD_MS,
  freshPopupNotifications,
  notificationAutoOpenKey,
  type HeaderNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const SEEN_STORAGE_KEY = "sioona.headerNotifications.seen";
/** Session-scoped — each tab visit can surface a fresh popup once. */
const AUTO_OPENED_STORAGE_KEY = "sioona.headerNotifications.autoOpened";

type NotificationsMenuProps = {
  notifications: HeaderNotification[];
};

function readIdSet(key: string, storage: Storage | null): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>, storage: Storage | null) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notificationIcon(id: string): ReactNode {
  if (id === "import-complete") {
    return <CheckCircleIcon className="size-3.5 shrink-0" />;
  }
  if (id === "partner-demo-ready") {
    return <SparklesIcon className="size-3.5 shrink-0" />;
  }
  if (id === "pending-review") {
    return <BoltIcon className="size-3.5 shrink-0" />;
  }
  if (id === "sync-failed") {
    return <RefreshClockwiseIcon className="size-3.5 shrink-0" />;
  }
  return <WarningIcon className="size-3.5 shrink-0" />;
}

function toneClasses(tone: HeaderNotification["tone"]) {
  switch (tone) {
    case "accent":
      return {
        tile: "bg-sio-bg-muted text-sio-fg-base",
        label: "Queue",
      };
    case "info":
      return {
        tile: "bg-sio-status-success-bg text-sio-status-success-fg",
        label: "Import",
      };
    case "warning":
    default:
      return {
        tile: "bg-sio-status-warning-bg text-sio-status-warning-fg",
        label: "Warning",
      };
  }
}

function toneLabelFor(item: HeaderNotification): string {
  if (item.id === "partner-demo-ready") return "Demo";
  if (item.id === "import-complete") return "Import";
  return toneClasses(item.tone).label;
}

export function NotificationsMenu({ notifications }: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const autoCloseTimerRef = useRef<number | null>(null);
  const userPinnedRef = useRef(false);

  const clearAutoClose = useCallback(() => {
    if (autoCloseTimerRef.current != null) {
      window.clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  const markSeen = useCallback(() => {
    if (notifications.length === 0) return;
    setSeenIds((prev) => {
      const nextSeen = new Set(prev);
      for (const n of notifications) {
        if (!n.sticky) nextSeen.add(n.id);
      }
      writeIdSet(SEEN_STORAGE_KEY, nextSeen, localStore());
      return nextSeen;
    });
  }, [notifications]);

  const closeMenu = useCallback(
    (opts?: { markSeen?: boolean; userPinned?: boolean }) => {
      clearAutoClose();
      if (opts?.markSeen) markSeen();
      if (opts?.userPinned) userPinnedRef.current = true;
      setOpen(false);
    },
    [clearAutoClose, markSeen],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setSeenIds(readIdSet(SEEN_STORAGE_KEY, localStore()));
      setHydrated(true);
    });
  }, []);

  // Drop autoOpened keys whose notification is no longer present.
  useEffect(() => {
    if (!hydrated) return;
    const store = sessionStore();
    const present = new Set(
      notifications.map((n) => notificationAutoOpenKey(n)),
    );
    const alreadyOpened = readIdSet(AUTO_OPENED_STORAGE_KEY, store);
    let changed = false;
    const nextOpened = new Set<string>();
    for (const key of alreadyOpened) {
      if (present.has(key)) {
        nextOpened.add(key);
      } else {
        changed = true;
      }
    }
    if (changed) {
      writeIdSet(AUTO_OPENED_STORAGE_KEY, nextOpened, store);
    }
  }, [hydrated, notifications]);

  // Auto-open briefly whenever any fresh notification appears.
  useEffect(() => {
    if (!hydrated || open) return;

    const store = sessionStore();
    const alreadyOpened = readIdSet(AUTO_OPENED_STORAGE_KEY, store);
    const fresh = freshPopupNotifications(notifications, {
      seenIds,
      alreadyOpened,
    });
    if (fresh.length === 0) return;

    const nextOpened = new Set(alreadyOpened);
    for (const n of fresh) nextOpened.add(notificationAutoOpenKey(n));
    writeIdSet(AUTO_OPENED_STORAGE_KEY, nextOpened, store);
    userPinnedRef.current = false;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const openAndScheduleClose = () => {
      setOpen(true);
      clearAutoClose();
      const holdMs = reducedMotion
        ? Math.min(NOTIFICATION_AUTO_OPEN_HOLD_MS, 2000)
        : NOTIFICATION_AUTO_OPEN_HOLD_MS;
      autoCloseTimerRef.current = window.setTimeout(() => {
        autoCloseTimerRef.current = null;
        if (userPinnedRef.current) return;
        closeMenu({ markSeen: true });
      }, holdMs);
    };

    if (reducedMotion) {
      queueMicrotask(openAndScheduleClose);
      return () => clearAutoClose();
    }

    const openTimer = window.setTimeout(openAndScheduleClose, 180);
    return () => {
      window.clearTimeout(openTimer);
      clearAutoClose();
    };
  }, [hydrated, notifications, seenIds, open, clearAutoClose, closeMenu]);

  useEffect(() => () => clearAutoClose(), [clearAutoClose]);

  const unreadCount = useMemo(() => {
    if (!hydrated) return notifications.length;
    return notifications.filter((n) => n.sticky || !seenIds.has(n.id)).length;
  }, [hydrated, notifications, seenIds]);

  const hasUnread = unreadCount > 0;
  const countLabel =
    notifications.length === 0
      ? "None"
      : `${notifications.length} open`;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) {
          clearAutoClose();
          userPinnedRef.current = true;
          setOpen(true);
          return;
        }
        closeMenu({ markSeen: true, userPinned: true });
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="btn-secondary relative size-11 shrink-0 px-0 outline-none focus-visible:shadow-[var(--focus-ring)] data-[state=open]:border-sio-border-strong data-[state=open]:bg-sio-bg-interactive data-[state=open]:shadow-none md:size-9"
          aria-label={
            hasUnread
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <BellIcon className="size-4 shrink-0" />
          {hasUnread ? (
            <span
              className="absolute left-1.5 top-1.5 size-2 rounded-full bg-sio-fg-base ring-2 ring-sio-bg-base"
              aria-hidden
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-2rem,22.5rem)] overflow-hidden rounded-lg border border-sio-border-base bg-sio-bg-base p-0 text-sio-fg-base shadow-md outline-none ring-0 focus:outline-none focus-visible:shadow-none"
        onPointerEnter={() => {
          userPinnedRef.current = true;
          clearAutoClose();
        }}
        onFocusCapture={() => {
          userPinnedRef.current = true;
          clearAutoClose();
        }}
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-3 px-3.5 py-3 font-normal">
          <span className="text-label-14 font-semibold tracking-tight text-sio-fg-base">
            Notifications
          </span>
          <span
            className={cn(
              "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-label-12 font-medium tabular-nums",
              notifications.length > 0
                ? "bg-sio-bg-muted text-sio-fg-base"
                : "bg-sio-bg-muted text-sio-fg-muted",
            )}
          >
            {countLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0 bg-sio-border-base" />

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-sio-bg-muted text-sio-fg-muted">
              <BellIcon className="size-4" />
            </span>
            <p className="mt-3 text-label-14 font-medium text-sio-fg-base">
              You&rsquo;re all caught up
            </p>
            <p className="mt-1 max-w-[16rem] text-pretty text-label-12 text-sio-fg-muted">
              Pending reviews, imports, Neon sync issues, and Signal Score
              outages will appear here.
            </p>
          </div>
        ) : (
          <div
            className="hide-scrollbar max-h-[min(22rem,70vh)] overflow-y-auto overscroll-contain"
            role="list"
          >
            {notifications.map((item, index) => {
              const tone = toneClasses(item.tone);
              const unread =
                item.sticky || (hydrated ? !seenIds.has(item.id) : true);
              const rowClass = cn(
                "flex w-full items-start gap-3 px-3.5 py-3 text-left",
                index > 0 && "border-t border-sio-border-base",
              );

              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className="cursor-pointer rounded-none px-0 py-0 focus:bg-transparent data-[highlighted]:bg-transparent"
                >
                  <Link
                    href={item.href}
                    role="listitem"
                    className={cn(
                      rowClass,
                      "group no-underline outline-none transition-colors duration-150 hover:bg-sio-bg-interactive focus-visible:bg-sio-bg-interactive",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
                        tone.tile,
                      )}
                      aria-hidden
                    >
                      {notificationIcon(item.id)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="mb-0.5 block text-label-12 text-sio-fg-muted">
                            {toneLabelFor(item)}
                            {unread ? (
                              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-sio-fg-base align-middle" />
                            ) : null}
                          </span>
                          <span className="block text-balance text-label-14 font-medium text-sio-fg-base">
                            {item.title}
                          </span>
                        </span>
                        <ExternalIcon className="mt-0.5 size-3.5 shrink-0 text-sio-fg-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </span>
                      <span className="mt-1 block text-pretty text-label-12 leading-4 text-sio-fg-muted">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
