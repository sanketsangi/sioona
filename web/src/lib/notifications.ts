import { viewHref } from "@/lib/views";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";

export type HeaderNotificationTone = "warning" | "info" | "accent";

export type HeaderNotification = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: HeaderNotificationTone;
  /** Stays unread (and in the tray) while the condition is still true. */
  sticky?: boolean;
};

export const QUEUE_UNAVAILABLE_TITLE = "Review queue unavailable";
export const QUEUE_UNAVAILABLE_DESCRIPTION =
  "The review queue is still loading. Retry in a moment.";

export const SCORE_UNAVAILABLE_TITLE = "Signal Score unavailable";
export const SCORE_UNAVAILABLE_DESCRIPTION =
  "This week’s score is still loading. Open Eval and retry in a moment.";

/** How long the tray stays open after an auto-open (then closes). */
export const NOTIFICATION_AUTO_OPEN_HOLD_MS = 4000;

/** Notification ids that briefly auto-open the header menu when unread. */
export const POPUP_NOTIFICATION_IDS = [
  "import-complete",
  "partner-demo-ready",
  "pending-review",
  "queue-unavailable",
  "score-unavailable",
  "sync-failed",
  "wipe-failed",
] as const;

/**
 * Stable key for one-shot auto-open. Includes title so a new import
 * (`Imported 46…` → `Imported 10…`) can open again without id churn.
 */
export function notificationAutoOpenKey(item: {
  id: string;
  title: string;
}): string {
  return `${item.id}\0${item.title}`;
}

/**
 * Unread items that have not been auto-opened yet.
 * When `popupIds` is omitted, every notification is eligible.
 */
export function freshPopupNotifications(
  notifications: HeaderNotification[],
  opts: {
    seenIds: Set<string>;
    alreadyOpened: Set<string>;
    /** Restrict to these ids; omit to open for any notification. */
    popupIds?: readonly string[];
  },
): HeaderNotification[] {
  const popupIds =
    opts.popupIds === undefined ? null : new Set<string>(opts.popupIds);
  return notifications.filter(
    (n) =>
      (popupIds === null || popupIds.has(n.id)) &&
      (n.sticky || !opts.seenIds.has(n.id)) &&
      !opts.alreadyOpened.has(notificationAutoOpenKey(n)),
  );
}

export function buildHeaderNotifications(input: {
  pendingCount: number;
  queueError: string | null;
  syncFailed: number;
  syncCreated: number;
  scoreUnavailable: boolean;
  demoReady?: boolean;
  wipeFailed?: boolean;
  /** From ?imported= after Upload → Insights. */
  importedCount?: number | null;
  /** From ?signals= after Upload → Insights. */
  newSignalCount?: number | null;
}): HeaderNotification[] {
  const items: HeaderNotification[] = [];

  const importedCount = input.importedCount;
  const newSignalCount = input.newSignalCount;
  const showImport =
    importedCount != null &&
    !Number.isNaN(importedCount) &&
    newSignalCount != null &&
    !Number.isNaN(newSignalCount);

  if (showImport) {
    const zeroSignals = newSignalCount === 0;
    const hasSyncFailure = input.syncFailed > 0;
    items.push({
      id: "import-complete",
      title: `Imported ${importedCount} conversations · ${newSignalCount} local signals`,
      description: zeroSignals
        ? ZERO_SIGNAL_HINT
        : hasSyncFailure
          ? "Neon sync failed for some predictions — needs-review queue may be incomplete."
          : input.pendingCount === 0
            ? "Import finished — use the status tabs or re-run detection if the queue stays empty."
            : "Open Pending in Insights to review the Neon needs-review queue.",
      href: zeroSignals
        ? viewHref("upload")
        : viewHref("insights", { status: "new" }),
      tone: zeroSignals || hasSyncFailure ? "warning" : "info",
    });
  }

  if (input.demoReady) {
    items.push({
      id: "partner-demo-ready",
      title: "Partner Demo Ready",
      description:
        "Review Neon needs-review below, then open Eval for precision and lift.",
      href: viewHref("insights", { status: "new", demo: "1" }),
      tone: "accent",
    });
  }

  if (input.wipeFailed) {
    items.push({
      id: "wipe-failed",
      title: "Neon Wipe Incomplete",
      description:
        "Demo reseeded in JSON, but FastAPI did not clear this tenant’s Neon rows. Leftover chats may remain until the API is up.",
      href: viewHref("insights", { wipeFailed: "1" }),
      tone: "warning",
    });
  }

  if (input.queueError) {
    items.push({
      id: "queue-unavailable",
      title: QUEUE_UNAVAILABLE_TITLE,
      description: QUEUE_UNAVAILABLE_DESCRIPTION,
      href: viewHref("insights", { status: "new" }),
      tone: "warning",
      sticky: true,
    });
  } else if (input.pendingCount > 0) {
    items.push({
      id: "pending-review",
      title: `${input.pendingCount} signal${input.pendingCount === 1 ? "" : "s"} need review`,
      description: "Shadow Mode queue — confirm or correct detections in Insights.",
      href: viewHref("insights", { status: "new" }),
      tone: "accent",
    });
  }

  if (input.syncFailed > 0) {
    items.push({
      id: "sync-failed",
      title: "Neon Dual-Write Incomplete",
      description: `${input.syncFailed} prediction${input.syncFailed === 1 ? "" : "s"} not written${
        input.syncCreated > 0 ? ` (${input.syncCreated} succeeded)` : ""
      }. Re-run Detection from Insights.`,
      href: viewHref("insights", {
        status: "new",
        syncFailed: String(input.syncFailed),
        syncCreated:
          input.syncCreated > 0 ? String(input.syncCreated) : null,
      }),
      tone: "warning",
    });
  }

  // Same FastAPI miss as queue-unavailable — do not stack a second score card.
  if (input.scoreUnavailable && !input.queueError) {
    items.push({
      id: "score-unavailable",
      title: SCORE_UNAVAILABLE_TITLE,
      description: SCORE_UNAVAILABLE_DESCRIPTION,
      href: viewHref("eval", { panel: "metrics" }),
      tone: "warning",
    });
  }

  return items;
}
