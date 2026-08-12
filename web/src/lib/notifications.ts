import { viewHref } from "@/lib/views";

export type HeaderNotificationTone = "warning" | "info" | "accent";

export type HeaderNotification = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: HeaderNotificationTone;
};

/** Notification ids that briefly auto-open the header menu when unread. */
export const POPUP_NOTIFICATION_IDS = [
  "partner-demo-ready",
  "sync-failed",
] as const;

export function buildHeaderNotifications(input: {
  pendingCount: number;
  queueError: string | null;
  syncFailed: number;
  syncCreated: number;
  scoreUnavailable: boolean;
  demoReady?: boolean;
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

  if (input.queueError) {
    items.push({
      id: "queue-unavailable",
      title: "Needs-review queue unavailable",
      description: input.queueError,
      href: viewHref("insights", { status: "new" }),
      tone: "warning",
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
