import { viewHref } from "@/lib/views";

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

export const QUEUE_UNAVAILABLE_TITLE =
  "Neon needs-review queue unavailable";
export const QUEUE_UNAVAILABLE_DESCRIPTION =
  "Showing local keep-set signals. Start FastAPI to load needs-review from Neon.";

/** Notification ids that briefly auto-open the header menu when unread. */
export const POPUP_NOTIFICATION_IDS = [
  "partner-demo-ready",
  "queue-unavailable",
  "sync-failed",
  "wipe-failed",
] as const;

export function buildHeaderNotifications(input: {
  pendingCount: number;
  queueError: string | null;
  syncFailed: number;
  syncCreated: number;
  scoreUnavailable: boolean;
  demoReady?: boolean;
  wipeFailed?: boolean;
}): HeaderNotification[] {
  const items: HeaderNotification[] = [];

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

  if (input.scoreUnavailable) {
    items.push({
      id: "score-unavailable",
      title: "Signal Score unreachable",
      description:
        "FastAPI/Neon Signal Score could not be loaded. Check BACKEND_URL and the API.",
      href: viewHref("eval", { panel: "metrics" }),
      tone: "warning",
    });
  }

  return items;
}
