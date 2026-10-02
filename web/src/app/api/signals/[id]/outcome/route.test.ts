import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendClientError } from "@/lib/backend-client";
import { readStore, resetStore } from "@/lib/store";
import { POST } from "./route";

const setPredictionOutcome = vi.fn();
const createPrediction = vi.fn();

vi.mock("@/lib/backend-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend-client")>();
  return {
    ...actual,
    setPredictionOutcome: (...args: unknown[]) => setPredictionOutcome(...args),
    createPrediction: (...args: unknown[]) => createPrediction(...args),
  };
});

function outcomeRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/signals/x/outcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

function call(id: string, body: unknown, raw = false) {
  return POST(outcomeRequest(body, raw), { params: Promise.resolve({ id }) });
}

function outcomeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pred-1",
    outcome_recorded_at: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /api/signals/[id]/outcome", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests")),
    );
    setPredictionOutcome.mockReset();
    setPredictionOutcome.mockResolvedValue(outcomeRow());
    createPrediction.mockReset();
    createPrediction.mockRejectedValue(new Error("backend unavailable in tests"));
    await resetStore();
    setPredictionOutcome.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([{}, { outcome: "won" }, { outcome: 3 }, { outcome: null }])(
    "rejects an invalid outcome %j with 400",
    async (body) => {
      const res = await call("sig_any", body);
      expect(res.status).toBe(400);
      expect(setPredictionOutcome).not.toHaveBeenCalled();
    },
  );

  it("treats an unparseable body as a missing outcome", async () => {
    const res = await call("sig_any", "{not json", true);
    expect(res.status).toBe(400);
  });

  it.each([-1, "abc", "Infinity"])("rejects value %j with 400", async (value) => {
    const res = await call("sig_any", {
      outcome: "retained",
      valueInr: value,
      backendSignalId: "pred-1",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Value must be a rupee amount of zero or more.",
    });
    expect(setPredictionOutcome).not.toHaveBeenCalled();
  });

  it("returns 409 when the signal has no Neon id", async () => {
    const res = await call("sig_missing", { outcome: "retained" });
    expect(res.status).toBe(409);
    expect(setPredictionOutcome).not.toHaveBeenCalled();
  });

  it("records an outcome for an unknown JSON signal via backendSignalId", async () => {
    const res = await call("sig_missing", {
      outcome: "churned",
      valueInr: "2500",
      recordedOn: "2026-09-09",
      backendSignalId: " pred-1 ",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      signal: null,
      outcome: "churned",
      valueInr: 2500,
      recordedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(setPredictionOutcome).toHaveBeenCalledWith("tenant_demo", " pred-1 ".trim(), {
      outcome: "churned",
      value_inr: 2500,
      recorded_on: "2026-09-09",
    });
  });

  it("ignores a recordedOn that is not YYYY-MM-DD and allows zero value", async () => {
    await call("sig_missing", {
      outcome: "converted",
      valueInr: 0,
      recordedOn: "09/09/2026",
      backendSignalId: "pred-1",
    });
    expect(setPredictionOutcome).toHaveBeenCalledWith("tenant_demo", "pred-1", {
      outcome: "converted",
      value_inr: 0,
      recorded_on: null,
    });
  });

  it("persists the outcome on a matching JSON signal", async () => {
    const store = await readStore();
    const target = store.signals[0];
    setPredictionOutcome.mockResolvedValue(outcomeRow({ id: "pred-linked" }));

    const res = await call(target.id, {
      outcome: "retained",
      valueInr: 100,
      backendSignalId: "pred-linked",
    });
    expect(res.status).toBe(200);

    const after = (await readStore()).signals.find((s) => s.id === target.id);
    expect(after?.backendSignalId).toBe("pred-linked");
    expect(after?.outcome).toMatchObject({ outcome: "retained", valueInr: 100 });
  });

  it("maps a backend 404 to 404 and other failures to 503", async () => {
    setPredictionOutcome.mockRejectedValueOnce(
      new BackendClientError("Prediction not found", 404),
    );
    const notFound = await call("sig_x", {
      outcome: "retained",
      backendSignalId: "pred-1",
    });
    expect(notFound.status).toBe(404);

    setPredictionOutcome.mockRejectedValueOnce(new Error("boom"));
    const failed = await call("sig_x", {
      outcome: "retained",
      backendSignalId: "pred-1",
    });
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toEqual({
      error: "Could not save the outcome.",
    });
  });
});
