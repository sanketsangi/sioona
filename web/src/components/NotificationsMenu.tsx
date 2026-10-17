"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  isNotificationUnread,
  notificationAutoOpenKey,
  notificationCategory,
  notificationSeenKey,
  orderNotificationsRecentFirst,
  stampNotificationArrivals,
  type HeaderNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const SEEN_STORAGE_KEY = "sioona.headerNotifications.seen";
/** Session-scoped arrival times so a new notice stays above older ones. */
const ARRIVED_STORAGE_KEY = "sioona.headerNotifications.arrived";

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

function readArrivals(storage: Storage | null): Record<string, number> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(ARRIVED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value))
        next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

function writeArrivals(
  arrivals: Record<string, number>,
  storage: Storage | null,
) {
  if (!storage) return;
  try {
    storage.setItem(ARRIVED_STORAGE_KEY, JSON.stringify(arrivals));
  } catch {
    /* ignore quota / private mode */
  }
}

function sameArrivals(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
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
  if (id === "sync-failed" || id === "llm-pass-remaining") {
    return <RefreshClockwiseIcon className="size-3.5 shrink-0" />;
  }
  return <WarningIcon className="size-3.5 shrink-0" />;
}

function tileClassFor(item: HeaderNotification): string {
  if (item.id === "llm-pass-remaining" || item.tone === "accent") {
    return "bg-sio-bg-muted text-sio-fg-base";
  }
  if (item.tone === "info") {
    return "bg-sio-status-success-bg text-sio-status-success-fg";
  }
  return "bg-sio-status-warning-bg text-sio-status-warning-fg";
}

export function NotificationsMenu({ notifications }: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const [arrivedAt, setArrivedAt] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);

  const markSeen = useCallback(() => {
    if (notifications.length === 0) return;
    setSeenIds((prev) => {
      const nextSeen = new Set(prev);
      for (const n of notifications) {
        if (!n.sticky) nextSeen.add(notificationSeenKey(n));
      }
      const capped =
        nextSeen.size <= 40
          ? nextSeen
          : new Set(
              [
                ...notifications.map((n) => notificationSeenKey(n)),
                ...[...nextSeen].slice(-24),
              ].slice(0, 40),
            );
      writeIdSet(SEEN_STORAGE_KEY, capped, localStore());
      return capped;
    });
  }, [notifications]);

  useEffect(() => {
    queueMicrotask(() => {
      setSeenIds(readIdSet(SEEN_STORAGE_KEY, localStore()));
      setArrivedAt(readArrivals(sessionStore()));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    queueMicrotask(() => {
      setArrivedAt((prev) => {
        const next = stampNotificationArrivals(notifications, prev, Date.now());
        if (sameArrivals(prev, next)) return prev;
        writeArrivals(next, sessionStore());
        return next;
      });
    });
  }, [hydrated, notifications]);

  // New notices update unread counts without taking keyboard focus.
  const ordered = useMemo(
    () => orderNotificationsRecentFirst(notifications, arrivedAt),
    [notifications, arrivedAt],
  );

  const unreadCount = useMemo(() => {
    if (!hydrated) return 0;
    return notifications.filter((n) => isNotificationUnread(n, seenIds)).length;
  }, [hydrated, notifications, seenIds]);

  const hasUnread = unreadCount > 0;
  const countLabel =
    notifications.length === 0
      ? "None"
      : unreadCount > 0
        ? `${unreadCount} unread`
        : `${notifications.length} open`;
  const unreadBadge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) markSeen();
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="btn-secondary relative !size-11 md:!size-9 shrink-0 !px-0 outline-none focus-visible:shadow-[var(--focus-ring)] data-[state=open]:border-sio-border-strong data-[state=open]:bg-sio-bg-interactive data-[state=open]:shadow-none"
          aria-label={
            hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
        >
          <BellIcon className="size-4 shrink-0" />
          {hasUnread ? (
            <span
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sio-fg-base px-1 text-[10px] font-medium leading-none text-sio-fg-on-color tabular-nums ring-2 ring-sio-bg-base"
              aria-hidden
            >
              {unreadBadge}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-2rem,22.5rem)] overflow-hidden rounded-lg border border-sio-border-base bg-sio-bg-base p-0 text-sio-fg-base shadow-md outline-none ring-0 focus:outline-none focus-visible:shadow-none"

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
              Pending reviews, imports, second-pass leftovers, and Signal Score
              outages will appear here.
            </p>
          </div>
        ) : (
          <div
            className="hide-scrollbar max-h-[min(22rem,70vh)] overflow-y-auto overscroll-contain"
            role="list"
          >
            {ordered.map((item, index) => {
              const unread = hydrated
                ? isNotificationUnread(item, seenIds)
                : item.sticky === true;
              const rowClass = cn(
                "flex w-full items-start gap-3 px-3.5 py-3 text-left",
                index > 0 && "border-t border-sio-border-base",
              );

              return (
                <DropdownMenuItem
                  key={notificationAutoOpenKey(item)}
                  asChild
                  className="cursor-pointer rounded-none px-0 py-0 outline-none focus:bg-transparent"
                >
                  <Link
                    href={item.href}
                    role="listitem"
                    className={cn(
                      rowClass,
                      "group no-underline outline-none transition-colors duration-150 hover:bg-sio-bg-interactive focus-visible:bg-sio-bg-interactive focus-visible:shadow-[var(--focus-ring)] data-[highlighted]:bg-sio-bg-interactive",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
                        tileClassFor(item),
                      )}
                      aria-hidden
                    >
                      {notificationIcon(item.id)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="mb-0.5 block text-label-12 text-sio-fg-muted">
                            {notificationCategory(item.id)}

                            {unread ? (
                              <>
                                <span className="sr-only">, unread</span>
                                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-sio-fg-base align-middle" />
                              </>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "block text-balance text-label-14 text-sio-fg-base",
                              unread ? "font-medium" : "font-normal",
                            )}
                          >
                            {item.title}
                          </span>
                        </span>
                        <ExternalIcon className="mt-0.5 size-3.5 shrink-0 text-sio-fg-muted opacity-60 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
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
