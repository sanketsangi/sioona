import { describe, expect, it } from "vitest";
import {
  POPUP_NOTIFICATION_IDS,
  buildHeaderNotifications,
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
    expect(items[0]?.title).toBe("Neon needs-review queue unavailable");
    expect(items[0]?.description).toContain("Start FastAPI");
    expect(items[0]?.sticky).toBe(true);
    expect(POPUP_NOTIFICATION_IDS).toContain("queue-unavailable");
  });

  it("includes sync and score warnings", () => {
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
});
