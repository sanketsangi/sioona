import { expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ getUploadSnapshot: vi.fn() }));
import { getUploadSnapshot } from "./backend-client";
vi.mock("./fetch-signal-score", () => ({ fetchSignalScoreSafe: vi.fn().mockResolvedValue({ reviewed_count: 6, correct_count: 3, incorrect_count: 0, revenue_saved_inr: 1200 }) }));
import { fetchSignalScoreSafe } from "./fetch-signal-score";
import { queryRevenueReport } from "./revenue-report-query";
import type { StoreData } from "./types";

it("uses the same file corpus and custom review window for display and download", async () => {
  const store = { tenant: { id: "a" }, conversations: [{ id: "c1", sourceFile: "one.csv" }, { id: "c2", sourceFile: "two.csv" }], messages: [], signals: [] } as unknown as StoreData;
  const { report, query } = await queryRevenueReport(store, { file: "one.csv", scoreFrom: "2026-10-01", reveal: true });
  expect(fetchSignalScoreSafe).toHaveBeenCalledWith("a", ["c1"], { dateFrom: "2026-10-01T00:00:00.000Z" });
  expect(report.precision.score).toBe(.5);
  expect(report.inrSaved).toBe(1200);
  expect(query.get("file")).toBe("one.csv");
  expect(query.get("scoreFrom")).toBe("2026-10-01T00:00:00.000Z");
  expect(query.get("reveal")).toBe("1");
});

it("preserves an inclusive upper bound in the backend query and download", async () => {
  const store = { tenant: { id: "a" }, conversations: [], messages: [], signals: [] } as unknown as StoreData;
  const result = await queryRevenueReport(store, { scoreFrom: "2026-10-01", scoreTo: "2026-10-04" });
  expect(fetchSignalScoreSafe).toHaveBeenLastCalledWith("a", [], { dateFrom: "2026-10-01T00:00:00.000Z", dateTo: "2026-10-04T23:59:59.999Z" });
  expect(result.query.get("scoreTo")).toBe("2026-10-04T23:59:59.999Z");
});

it("keeps invalid range links invalid instead of silently widening them", async () => {
  vi.mocked(fetchSignalScoreSafe).mockClear();
  const store = { tenant: { id: "a" }, conversations: [], messages: [], signals: [] } as unknown as StoreData;
  const result = await queryRevenueReport(store, { scoreFrom: "2026-10-04", scoreTo: "2026-10-01" });
  expect(fetchSignalScoreSafe).not.toHaveBeenCalled();
  expect(result.scoreAvailable).toBe(false);
  expect(result.report.revenueVerified).toBe(false);
  expect(result.query.get("scoreTo")).toBe("2026-10-01");
});

it("invalid start dates never broaden into default score queries", async () => {
  vi.mocked(fetchSignalScoreSafe).mockClear();
  const store = { tenant: { id: "a" }, conversations: [], messages: [], signals: [] } as unknown as StoreData;
  const result = await queryRevenueReport(store, { scoreFrom: "2026-02-30" });
  expect(fetchSignalScoreSafe).not.toHaveBeenCalled();
  expect(result.rangeErrorField).toBe("scoreFrom");
  expect(result.query.get("scoreFrom")).toBe("2026-02-30");
});

it("does not display a JSON detect quote on the live report without a valid anchor", async () => {
  const store = {
    tenant: { id: "a", name: "A", createdAt: "2026-10-01T00:00:00.000Z" },
    conversations: [{
      id: "c1",
      tenantId: "a",
      channel: "upload",
      startedAt: "2026-10-01T00:00:00.000Z",
      messageIds: ["m1"],
    }],
    messages: [{
      id: "m1",
      conversationId: "c1",
      role: "customer",
      content: "Please pause my SIP this month",
      timestamp: "2026-10-01T00:00:00.000Z",
    }],
    signals: [{
      id: "sig_1",
      tenantId: "a",
      conversationId: "c1",
      type: "retention",
      score: 0.9,
      confidence: 0.9,
      summary: "Leaving",
      suggestedAction: "Call",
      evidence: ['quote: "Please pause my SIP this month"'],
      status: "new",
      createdAt: "2026-10-01T00:00:00.000Z",
    }],
  } as unknown as StoreData;
  const result = await queryRevenueReport(store, { scoreFrom: "2026-10-01" });
  expect(result.report.customersAtRisk[0]?.quote).toBe("");
  expect(JSON.stringify(result.report.customersAtRisk)).not.toContain("Please pause my SIP");
});

it("does not invent a snapshot report quote when reconstruction is unresolved", async () => {
  vi.mocked(getUploadSnapshot).mockResolvedValue({
    upload: { tenant_id: "a", upload_id: "u1", status: "completed", source: "old.csv" },
    run_id: "old",
    conversations: [{
      conversation_id: "c2",
      channel: "upload",
      started_at: "2026-10-01T00:00:00Z",
      messages: [{
        message_id: "m1",
        role: "customer",
        content: "Close my account",
        timestamp: "2026-10-01T00:00:00Z",
      }],
    }],
    detections: [{ conversation_id: "c2", output: [{ signal_type: "retention", evidence: [] }] }],
    predictions: [{
      id: "old-prediction",
      tenant_id: "a",
      conversation_id: "c2",
      signal_type: "retention",
      confidence: 0.9,
      summary: "Leaving",
      created_at: "2026-10-01T00:00:00Z",
      feedback: null,
      evidence_status: "unresolved",
      evidence_spans: [],
    }],
  } as never);
  const store = {
    tenant: { id: "a" },
    conversations: [],
    messages: [],
    signals: [],
  } as unknown as StoreData;
  const result = await queryRevenueReport(store, { uploadId: "u1", scoreFrom: "2026-10-01" });
  expect(result.report.customersAtRisk[0]?.quote).toBe("");
  expect(JSON.stringify(result.report)).not.toContain("Close my account");
});

it("keeps upload membership in score scope and every report link", async () => {
  vi.mocked(getUploadSnapshot).mockResolvedValue({ upload: { tenant_id: "a", upload_id: "u1", status: "completed", source: "same.csv" }, run_id: "u1", conversations: [{ conversation_id: "c2", channel: "upload", started_at: "2026-10-01T00:00:00Z", messages: [] }], detections: [{ conversation_id: "c2", output: [] }], predictions: [] } as never);
  const store = { tenant: { id: "a" }, conversations: [{ id: "c1", sourceFile: "same.csv" }, { id: "c2", sourceFile: "same.csv" }], signals: [], messages: [] } as unknown as StoreData;
  const result = await queryRevenueReport(store, { uploadId: "u1", file: "same.csv", scoreFrom: "2026-10-01" });
  expect(fetchSignalScoreSafe).toHaveBeenLastCalledWith("a", ["c2"], { uploadId: "u1", dateFrom: "2026-10-01T00:00:00.000Z" });
  expect(result.query.get("uploadId")).toBe("u1");
  expect(result.scopeError).toBeUndefined();
  vi.mocked(getUploadSnapshot).mockRejectedValue(new Error("not found"));
  vi.mocked(fetchSignalScoreSafe).mockClear();
  const unavailable = await queryRevenueReport(store, { uploadId: "u1", scoreFrom: "2026-10-01" });
  expect(unavailable.scopeError).toBeTruthy();
  expect(unavailable.scopedStore.conversations).toEqual([]);
  expect(unavailable.report.revenueVerified).toBe(false);
  expect(fetchSignalScoreSafe).not.toHaveBeenCalled();
});
