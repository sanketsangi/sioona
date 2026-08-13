import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { EXPECTED_TESTING_JSON } from "./testing-json-eval";
import {
  readStore,
  resetStore,
  setSignalActed,
  setSignalFeedback,
} from "./store";

describe("setSignalActed", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects missing signals", async () => {
    const result = await setSignalActed("sig_missing", true);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects unreviewed signals", async () => {
    const store = await readStore();
    const target = store.signals.find((s) => !s.feedback);
    expect(target).toBeTruthy();

    const result = await setSignalActed(target!.id, true);
    expect(result).toEqual({ ok: false, reason: "not_reviewed" });

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target!.id)?.status).not.toBe(
      "acted"
    );
  });

  it("marks reviewed signals acted without clearing feedback", async () => {
    const before = await readStore();
    const target = before.signals[0];
    expect(target).toBeTruthy();

    await setSignalFeedback(target.id, "correct", "clear buying intent");
    const result = await setSignalActed(target.id, true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signal.status).toBe("acted");
    expect(result.signal.feedback?.label).toBe("correct");
    expect(result.signal.feedback?.note).toBe("clear buying intent");

    const after = await readStore();
    const persisted = after.signals.find((s) => s.id === target.id);
    expect(persisted?.status).toBe("acted");
    expect(persisted?.feedback?.label).toBe("correct");
  });

  it("undoes acted back to reviewed and keeps feedback", async () => {
    const before = await readStore();
    const target = before.signals[0];
    await setSignalFeedback(target.id, "incorrect", "not churn");
    await setSignalActed(target.id, true);

    const undone = await setSignalActed(target.id, false);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.signal.status).toBe("reviewed");
    expect(undone.signal.feedback?.label).toBe("incorrect");
    expect(undone.signal.feedback?.note).toBe("not churn");
  });

  it("does not clear acted when feedback is saved again", async () => {
    const before = await readStore();
    const target = before.signals[0];
    await setSignalFeedback(target.id, "correct");
    await setSignalActed(target.id, true);
    await setSignalFeedback(target.id, "partially_correct", "ok type");

    const after = await readStore();
    const persisted = after.signals.find((s) => s.id === target.id);
    expect(persisted?.status).toBe("acted");
    expect(persisted?.feedback?.label).toBe("partially_correct");
    expect(persisted?.feedback?.note).toBe("ok type");
  });
});

describe("readStore cold-start hydrate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not GET conversations when store.json already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
    const getSpy = vi.spyOn(backendClient, "getConversations");
    const signalsSpy = vi.spyOn(backendClient, "getTenantSignals");

    const store = await readStore();

    expect(store.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(getSpy).not.toHaveBeenCalled();
    expect(signalsSpy).not.toHaveBeenCalled();
  });

  it("resetStore still seeds testing.json without hydrating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    const getSpy = vi.spyOn(backendClient, "getConversations");
    const signalsSpy = vi.spyOn(backendClient, "getTenantSignals");

    const store = await resetStore();

    expect(store.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(store.conversations.some((c) => c.id === "conv_priya_sharma_22")).toBe(
      true
    );
    expect(getSpy).not.toHaveBeenCalled();
    expect(signalsSpy).not.toHaveBeenCalled();
  });
});
