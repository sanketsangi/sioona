import { describe, expect, it, vi } from "vitest";
import {
  BACKEND_WAKE_COOLDOWN_MS,
  BACKEND_WAKE_STORAGE_KEY,
  FOLLOWUP_UNAVAILABLE_PANEL_BODY,
  QUEUE_UNAVAILABLE_PANEL_BODY,
  QUEUE_UNAVAILABLE_PANEL_TITLE,
  clearBackendWakeAttempt,
  markBackendWakeAttempted,
  shouldAttemptBackendWake,
  shouldWakeBackendFromNotifications,
  wakeBackendAndRefresh,
} from "./backend-wake";

function memoryStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

describe("shouldWakeBackendFromNotifications", () => {
  it("wakes on queue-unavailable or score-unavailable only", () => {
    expect(shouldWakeBackendFromNotifications([{ id: "pending-review" }])).toBe(
      false
    );
    expect(
      shouldWakeBackendFromNotifications([{ id: "queue-unavailable" }])
    ).toBe(true);
    expect(
      shouldWakeBackendFromNotifications([{ id: "score-unavailable" }])
    ).toBe(true);
  });
});

describe("shouldAttemptBackendWake", () => {
  it("allows the first attempt and respects cooldown", () => {
    const storage = memoryStorage();
    expect(shouldAttemptBackendWake(storage, 1_000)).toBe(true);
    markBackendWakeAttempted(storage, 1_000);
    expect(shouldAttemptBackendWake(storage, 1_000 + 10_000)).toBe(false);
    expect(
      shouldAttemptBackendWake(storage, 1_000 + BACKEND_WAKE_COOLDOWN_MS)
    ).toBe(true);
  });

  it("retries after clear or a non-numeric stamp", () => {
    const storage = memoryStorage({ [BACKEND_WAKE_STORAGE_KEY]: "nope" });
    expect(shouldAttemptBackendWake(storage, 5_000)).toBe(true);
    markBackendWakeAttempted(storage, 5_000);
    clearBackendWakeAttempt(storage);
    expect(shouldAttemptBackendWake(storage, 5_001)).toBe(true);
  });
});

describe("wakeBackendAndRefresh", () => {
  it("pings health then refreshes once", async () => {
    const storage = memoryStorage();
    const fetchHealth = vi.fn().mockResolvedValue({ status: "ok" });
    const refresh = vi.fn();

    await expect(
      wakeBackendAndRefresh({
        storage,
        now: 10_000,
        fetchHealth,
        refresh,
      })
    ).resolves.toBe("refreshed");

    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(storage.getItem(BACKEND_WAKE_STORAGE_KEY)).toBe("10000");
  });

  it("still refreshes when the wake ping fails", async () => {
    const storage = memoryStorage();
    const fetchHealth = vi.fn().mockRejectedValue(new Error("timed out"));
    const refresh = vi.fn();

    await expect(
      wakeBackendAndRefresh({
        storage,
        now: 20_000,
        fetchHealth,
        refresh,
      })
    ).resolves.toBe("refreshed");

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("skips a second attempt inside the cooldown", async () => {
    const storage = memoryStorage();
    const fetchHealth = vi.fn().mockResolvedValue({ status: "ok" });
    const refresh = vi.fn();

    await wakeBackendAndRefresh({
      storage,
      now: 30_000,
      fetchHealth,
      refresh,
    });
    await expect(
      wakeBackendAndRefresh({
        storage,
        now: 30_000 + 1_000,
        fetchHealth,
        refresh,
      })
    ).resolves.toBe("skipped");

    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("partner-safe queue copy", () => {
  it("does not mention FastAPI, Neon, or BACKEND_URL", () => {
    const leak = /FastAPI|Neon|BACKEND_URL|localhost/i;
    expect(QUEUE_UNAVAILABLE_PANEL_TITLE).toBe("Review Queue Unavailable");
    expect(QUEUE_UNAVAILABLE_PANEL_BODY).not.toMatch(leak);
    expect(FOLLOWUP_UNAVAILABLE_PANEL_BODY).not.toMatch(leak);
    expect(QUEUE_UNAVAILABLE_PANEL_BODY).toMatch(/waking/i);
  });
});
