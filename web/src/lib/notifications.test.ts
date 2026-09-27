import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_AUTO_OPEN_HOLD_MS,
  POPUP_NOTIFICATION_IDS,
  QUEUE_UNAVAILABLE_DESCRIPTION,
  QUEUE_UNAVAILABLE_TITLE,
  SCORE_UNAVAILABLE_DESCRIPTION,
  SCORE_UNAVAILABLE_TITLE,
  buildHeaderNotifications,
  freshPopupNotifications,
  notificationAutoOpenKey,
} from "./notifications";

describe("buildHeaderNotifications", () => {
  it("surfaces pending review count", () => {
    const items = buildHeaderNotifications({
      pendingCount: 3,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("pending-review");
    expect(items[0]?.tone).toBe("accent");
    expect(items[0]?.href).toContain("status=new");
  });

  it("prefers queue error over pending count", () => {
    const items = buildHeaderNotifications({
      pendingCount: 5,
      queueError: "backend down",
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
    });
    expect(items.map((i) => i.id)).toEqual(["queue-unavailable"]);
    expect(items[0]?.title).toBe(QUEUE_UNAVAILABLE_TITLE);
    expect(items[0]?.description).toBe(QUEUE_UNAVAILABLE_DESCRIPTION);
    expect(items[0]?.description).not.toMatch(/FastAPI|BACKEND_URL/);
    expect(items[0]?.sticky).toBe(true);
    expect(POPUP_NOTIFICATION_IDS).toContain("queue-unavailable");
  });

  it("collapses score miss into queue-unavailable on the same outage", () => {
    const items = buildHeaderNotifications({
      pendingCount: 0,
      queueError: "backend down",
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: true,
    });
    expect(items.map((i) => i.id)).toEqual(["queue-unavailable"]);
    expect(items[0]?.sticky).toBe(true);
    expect(items.some((i) => i.id === "score-unavailable")).toBe(false);
    expect(JSON.stringify(items)).not.toMatch(/FastAPI|BACKEND_URL/);
  });

  it("includes sync and score warnings when queue is healthy", () => {
    const items = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 2,
      syncCreated: 1,
      scoreUnavailable: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      "sync-failed",
      "score-unavailable",
    ]);
    expect(items[0]?.title).toBe("Neon Dual-Write Incomplete");
    expect(items[0]?.tone).toBe("warning");
    expect(items[0]?.description).toContain("2 predictions not written");
    expect(items[0]?.description).toContain("1 succeeded");
    expect(items[1]?.title).toBe(SCORE_UNAVAILABLE_TITLE);
    expect(items[1]?.description).toBe(SCORE_UNAVAILABLE_DESCRIPTION);
    expect(items[1]?.description).not.toMatch(/FastAPI|BACKEND_URL/);
  });

  it("includes partner demo ready when demoReady", () => {
    const items = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      demoReady: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("partner-demo-ready");
    expect(items[0]?.title).toBe("Partner Demo Ready");
    expect(items[0]?.tone).toBe("accent");
    expect(items[0]?.href).toContain("status=new");
    expect(items[0]?.href).toContain("demo=1");
  });

  it("includes wipe-failed when Neon wipe did not complete", () => {
    const items = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      wipeFailed: true,
    });
    expect(items.map((i) => i.id)).toEqual(["wipe-failed"]);
    expect(items[0]?.tone).toBe("warning");
    expect(items[0]?.href).toContain("wipeFailed=1");
  });

  it("stacks demo ready ahead of sync failure", () => {
    const items = buildHeaderNotifications({
      pendingCount: 1,
      queueError: null,
      syncFailed: 3,
      syncCreated: 0,
      scoreUnavailable: false,
      demoReady: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      "partner-demo-ready",
      "pending-review",
      "sync-failed",
    ]);
  });

  it("empty queue keeps exceptions and omits queue-clear", () => {
    const items = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 2,
      syncCreated: 1,
      scoreUnavailable: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      "sync-failed",
      "score-unavailable",
    ]);
    expect(items.some((i) => i.id === "queue-clear")).toBe(false);
    expect(POPUP_NOTIFICATION_IDS).not.toContain("queue-clear");
  });

  it("empty queue with no exceptions is an empty tray", () => {
    const items = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
    });
    expect(items).toEqual([]);
  });

  it("pending queue keeps attention item and skips queue-clear", () => {
    const items = buildHeaderNotifications({
      pendingCount: 3,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
    });
    expect(items.map((i) => i.id)).toEqual(["pending-review"]);
    expect(items[0]?.href).toContain("status=new");
    expect(items.some((i) => i.id === "queue-clear")).toBe(false);
  });

  it("surfaces import-complete from Upload redirect params", () => {
    const ready = buildHeaderNotifications({
      pendingCount: 3,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      importedCount: 46,
      newSignalCount: 3,
    });
    expect(ready.map((i) => i.id)).toEqual([
      "import-complete",
      "pending-review",
    ]);
    expect(ready[0]?.title).toBe(
      "Imported 46 conversations · 3 local signals",
    );
    expect(ready[0]?.description).toContain("needs-review queue");
    expect(ready[0]?.tone).toBe("info");
    expect(POPUP_NOTIFICATION_IDS).toContain("import-complete");

    const zero = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      importedCount: 10,
      newSignalCount: 0,
    });
    expect(zero[0]?.id).toBe("import-complete");
    expect(zero[0]?.tone).toBe("warning");
    expect(zero[0]?.href).toContain("upload");
  });

  it("surfaces a failed Groq pass without zeroing the import signal count", () => {
    const items = buildHeaderNotifications({
      pendingCount: 19,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      importedCount: 100,
      newSignalCount: 19,
      llmFailed: 4,
      llmFailure: "model",
    });
    const imported = items.find((item) => item.id === "import-complete");
    const failed = items.find((item) => item.id === "llm-pass-failed");
    expect(imported?.title).toBe(
      "Imported 100 conversations · 19 local signals"
    );
    expect(failed?.title).toBe("Second pass failed");
    expect(failed?.description).toContain("19 signals from the first pass");
    expect(failed?.description).toContain("no longer serves this model");
    expect(failed?.tone).toBe("warning");
    expect(POPUP_NOTIFICATION_IDS).toContain("llm-pass-failed");
  });

  it("after API up returns pending-review or empty", () => {
    const pending = buildHeaderNotifications({
      pendingCount: 2,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
    });
    expect(pending.map((i) => i.id)).toEqual(["pending-review"]);

    const empty = buildHeaderNotifications({
      pendingCount: 0,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
    });
    expect(empty).toEqual([]);
  });
});

describe("freshPopupNotifications", () => {
  it("auto-opens any unread notification, then again when the title changes", () => {
    const first = buildHeaderNotifications({
      pendingCount: 3,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      importedCount: 46,
      newSignalCount: 3,
    });
    const importItem = first.find((i) => i.id === "import-complete");
    expect(importItem).toBeTruthy();

    const fresh = freshPopupNotifications(first, {
      seenIds: new Set(),
      alreadyOpened: new Set(),
    });
    expect(fresh.map((i) => i.id)).toEqual([
      "import-complete",
      "pending-review",
    ]);

    const afterOpen = freshPopupNotifications(first, {
      seenIds: new Set(),
      alreadyOpened: new Set(fresh.map((i) => notificationAutoOpenKey(i))),
    });
    expect(afterOpen).toEqual([]);

    const secondImport = buildHeaderNotifications({
      pendingCount: 1,
      queueError: null,
      syncFailed: 0,
      syncCreated: 0,
      scoreUnavailable: false,
      importedCount: 10,
      newSignalCount: 1,
    });
    const freshAgain = freshPopupNotifications(secondImport, {
      seenIds: new Set(),
      alreadyOpened: new Set([notificationAutoOpenKey(importItem!)]),
    });
    expect(freshAgain.map((i) => i.id)).toContain("import-complete");
    expect(notificationAutoOpenKey(secondImport[0]!)).not.toBe(
      notificationAutoOpenKey(importItem!),
    );
  });

  it("exports a multi-second auto-open hold", () => {
    expect(NOTIFICATION_AUTO_OPEN_HOLD_MS).toBeGreaterThanOrEqual(3000);
  });
});
