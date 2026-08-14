"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BellIcon } from "@/components/icons/BellIcon";
import { BoltIcon } from "@/components/icons/BoltIcon";
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
  POPUP_NOTIFICATION_IDS,
  type HeaderNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const SEEN_STORAGE_KEY = "sioona.headerNotifications.seen";
const AUTO_OPENED_STORAGE_KEY = "sioona.headerNotifications.autoOpened";

type NotificationsMenuProps = {
  notifications: HeaderNotification[];
};

function readIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

function notificationIcon(id: string): ReactNode {
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
        tile: "bg-sio-bg-muted text-sio-fg-muted",
        label: "Info",
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
  return toneClasses(item.tone).label;
}

export function NotificationsMenu({ notifications }: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const autoOpenAttempted = useRef(false);

  useEffect(() => {
    setSeenIds(readIdSet(SEEN_STORAGE_KEY));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || autoOpenAttempted.current || open) return;

    const popupIds = new Set<string>(POPUP_NOTIFICATION_IDS);
    const unreadPopup = notifications.filter(
      (n) => popupIds.has(n.id) && !seenIds.has(n.id),
    );
    if (unreadPopup.length === 0) return;

    const alreadyOpened = readIdSet(AUTO_OPENED_STORAGE_KEY);
    const fresh = unreadPopup.filter((n) => !alreadyOpened.has(n.id));
    if (fresh.length === 0) return;

    autoOpenAttempted.current = true;
    const nextOpened = new Set(alreadyOpened);
    for (const n of fresh) nextOpened.add(n.id);
    writeIdSet(AUTO_OPENED_STORAGE_KEY, nextOpened);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Open once to surface the alert; skip delayed open when reduced motion.
    if (reducedMotion) {
      setOpen(true);
      return;
    }

    const timer = window.setTimeout(() => setOpen(true), 180);
    return () => window.clearTimeout(timer);
  }, [hydrated, notifications, seenIds, open]);

  const unreadCount = useMemo(() => {
    if (!hydrated) return notifications.length;
    return notifications.filter((n) => !seenIds.has(n.id)).length;
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
        if (!next && open && notifications.length > 0) {
          const nextSeen = new Set(seenIds);
          for (const n of notifications) nextSeen.add(n.id);
          setSeenIds(nextSeen);
          writeIdSet(SEEN_STORAGE_KEY, nextSeen);
        }
        setOpen(next);
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
              Pending reviews, Neon sync issues, and Signal Score outages will
              appear here.
            </p>
          </div>
        ) : (
          <div
            className="max-h-[min(22rem,70vh)] overflow-y-auto overscroll-contain"
            role="list"
          >
            {notifications.map((item, index) => {
              const tone = toneClasses(item.tone);
              const unread = hydrated ? !seenIds.has(item.id) : true;
              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className={cn(
                    "cursor-pointer rounded-none px-0 py-0 focus:bg-transparent data-[highlighted]:bg-transparent",
                    index > 0 && "border-t border-sio-border-base",
                  )}
                >
                  <Link
                    href={item.href}
                    role="listitem"
                    className="group flex w-full items-start gap-3 px-3.5 py-3 text-left no-underline outline-none transition-colors duration-150 hover:bg-sio-bg-interactive focus-visible:bg-sio-bg-interactive"
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
