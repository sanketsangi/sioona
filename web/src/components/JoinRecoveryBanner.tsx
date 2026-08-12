"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ReDetectButton } from "@/components/ReDetectButton";
import { viewHref } from "@/lib/views";

const STORAGE_PREFIX = "sioona:join-recovery-dismissed:";
const DISMISS_EVENT = "sioona-join-recovery-dismiss";

/**
 * Dismiss state lives in sessionStorage (not localStorage): survives soft
 * navigations / router.refresh within the tab session, clears on tab close
 * or hard refresh of a new session. Keyed by signal id + reason so a new
 * preview signal can show the banner again.
 */
function storageKey(signalId: string, reason: string) {
  return `${STORAGE_PREFIX}${signalId}:${reason}`;
}

function readDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribeDismiss(onStoreChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onStoreChange);
  return () => window.removeEventListener(DISMISS_EVENT, onStoreChange);
}

type JoinRecoveryBannerProps = {
  signalId: string;
  /** Stable reason for dismiss key; default matches Neon stub missing local join. */
  reason?: string;
};

/**
 * Warning banner for Neon stub / missing local conversation join — Upload +
 * Re-run Detection. Not shown in the Insights header action slot.
 */
export function JoinRecoveryBanner({
  signalId,
  reason = "no-local-conversation",
}: JoinRecoveryBannerProps) {
  const key = storageKey(signalId, reason);
  const getSnapshot = useCallback(() => readDismissed(key), [key]);
  // Hide until client snapshot — avoids hydration flash of a dismissed banner.
  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    getSnapshot,
    () => true,
  );
  // Same-tab dismiss also bumps local state so UI updates if the event is missed.
  const [localDismissed, setLocalDismissed] = useState(false);
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setLocalDismissed(false);
  }

  function dismiss() {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // private mode / quota — still hide for this mount
    }
    setLocalDismissed(true);
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  if (dismissed || localDismissed) return null;

  return (
    <div
      className="status-banner status-banner-warning shrink-0"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-copy-14 text-sio-fg-base">No Local Conversation</p>
          <p className="mt-0.5 text-pretty text-label-13 text-sio-fg-subtle">
            This Neon needs-review item has no matching local chat. Upload chats
            or re-run detection to restore the join — Open Conversation returns
            when messages are available.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={viewHref("upload")} className="btn-secondary">
            Upload Chats
          </Link>
          <ReDetectButton />
          <button
            type="button"
            onClick={dismiss}
            className="btn-tertiary"
            aria-label="Dismiss join recovery notice"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
