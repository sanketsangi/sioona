import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tryHydrateStoreFromNeon } from "./hydrate-conversations";
import { runWithTenant } from "./tenant-context";
import { readStore, setConversationGroundTruth, writeStore } from "./store";
import * as backend from "./backend-client";
import { runHybridDetectionWithLedger } from "./ai/run-with-ledger";
import * as reconciliation from "./conversation-reconciliation";
import { fetchTenantSignals } from "./fetch-tenant-signals";
vi.mock("./backend-client", () => ({ getPilotSettings: vi.fn(), getDetectionResume: vi.fn(async () => null), getActiveUploads: vi.fn(), getConversations: vi.fn(), getSupervisedActionDecisions: vi.fn(), patchConversationGroundTruth: vi.fn(), HYDRATE_CONVERSATIONS_TIMEOUT_MS: 1000 }));
vi.mock("./fetch-tenant-signals", () => ({ fetchTenantSignals: vi.fn(async () => ({ ok: true, rows: [] })) }));
vi.mock("./sync-taxonomy", () => ({ taxonomyOverridesFromNeon: vi.fn(async () => ({})), taxonomyNeonEnabled: () => false }));
vi.mock("./ai/run-with-ledger", () => ({ runHybridDetectionWithLedger: vi.fn() }));
const row = { id: "uuid", tenant_id: "t", conversation_id: "c", channel: "chat", customer_name: null, started_at: "2026-10-01T00:00:00Z", external_id: null, ground_truth: "lead" as const, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", messages: [{ id: "uuid-m", tenant_id: "t", conversation_id: "c", message_id: "m", role: "customer", content: "Hello", timestamp: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }] };
beforeEach(() => { vi.stubEnv("SIOONA_STATE_MODE", "postgres"); vi.mocked(backend.getPilotSettings).mockResolvedValue(null); vi.mocked(backend.getDetectionResume).mockResolvedValue(null); vi.mocked(backend.getActiveUploads).mockResolvedValue([]); vi.mocked(backend.getConversations).mockResolvedValue([row]); vi.mocked(backend.getSupervisedActionDecisions).mockResolvedValue([]); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("reconstructs conversations/messages without detection or JSON writes", async () => {
  const store = await runWithTenant("t", () => tryHydrateStoreFromNeon());
  expect(store?.conversations.map(c => c.id)).toEqual(["c"]);
  expect(store?.messages[0].content).toBe("Hello");
  expect(runHybridDetectionWithLedger).not.toHaveBeenCalled();
  await runWithTenant("t", () => writeStore(store!));
  expect((await runWithTenant("t", () => readStore())).messages).toEqual(store?.messages);
});
it("fails closed on a conversation outage", async () => {
  vi.mocked(backend.getConversations).mockRejectedValue(new Error("offline"));
  await expect(runWithTenant("t", () => readStore())).rejects.toThrow("Canonical conversation read unavailable");
});
it("distinguishes an empty tenant from an outage", async () => {
  vi.mocked(backend.getConversations).mockResolvedValue([]);
  expect((await runWithTenant("t", () => readStore())).conversations).toEqual([]);
});
it("keeps the fetched baseline when the live-partner filter matches nothing", async () => {
  vi.mocked(backend.getDetectionResume).mockResolvedValue({ tenant_id: "t", failed_conversation_ids: ["pending"], skipped_conversation_ids: ["skipped"], updated_at: "2026-10-01T00:00:00Z" });
  vi.mocked(backend.getPilotSettings).mockResolvedValue({
    id: "pilot-1",
    tenant_id: "t",
    baseline_opportunities: 12,
    baseline_note: "agreed baseline",
    weekly_export_count: 3,
    last_uploaded_file_name: "week-export.csv",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
  });
  vi.mocked(backend.getConversations).mockResolvedValue([
    { ...row, updated_at: "2026-09-01T00:00:00Z" },
  ]);
  const store = await runWithTenant("t", () => readStore());
  expect(store.conversations).toEqual([]);
  expect(store.messages).toEqual([]);
  expect(store.llmFailedConversationIds).toEqual(["pending"]);
  expect(store.llmSkippedConversationIds).toEqual(["skipped"]);
  expect(store.signals).toEqual([]);
  expect(store.pilot).toMatchObject({
    baselineOpportunities: 12,
    baselineNote: "agreed baseline",
    weeklyExportCount: 3,
    lastUploadedFileName: "week-export.csv",
  });
});
it("keeps persisted pilot settings when a canonical tenant has no conversations", async () => {
  vi.mocked(backend.getConversations).mockResolvedValue([]);
  vi.mocked(backend.getPilotSettings).mockResolvedValue({
    id: "pilot-1",
    tenant_id: "t",
    baseline_opportunities: 12,
    baseline_note: "agreed baseline",
    weekly_export_count: 3,
    last_uploaded_file_name: "week-export.csv",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
  });
  const first = await runWithTenant("t", () => readStore());
  const second = await runWithTenant("t", () => readStore());
  expect(first.conversations).toEqual([]);
  expect(first.pilot).toMatchObject({
    baselineOpportunities: 12,
    baselineNote: "agreed baseline",
    weeklyExportCount: 3,
    lastUploadedFileName: "week-export.csv",
  });
  expect(second.pilot).toMatchObject({
    baselineOpportunities: 12,
    baselineNote: "agreed baseline",
    weeklyExportCount: 3,
    lastUploadedFileName: "week-export.csv",
  });
});
it("rejects a cross-tenant response", async () => {
  vi.mocked(backend.getConversations).mockResolvedValue([{ ...row, tenant_id: "other" }]);
  await expect(runWithTenant("t", () => readStore())).rejects.toThrow("cross-tenant row");
});
it("rejects invalid message roles as integrity failures", async () => {
  vi.mocked(backend.getConversations).mockResolvedValue([{ ...row, messages: [{ ...row.messages[0], role: "operator" }] }]);
  await expect(runWithTenant("t", () => readStore())).rejects.toThrow("invalid message role");
});
it("fails closed when upload membership references a missing conversation", async () => {
  vi.mocked(backend.getActiveUploads).mockResolvedValue([{
    upload: { tenant_id: "t", upload_id: "u", source: "week.csv", content_sha256: "a".repeat(64), status: "completed", imported_at: "2026-10-01T00:00:00Z" },
    conversation_ids: ["c", "missing"],
  }]);
  await expect(runWithTenant("t", () => readStore())).rejects.toThrow("upload membership hole");
});
it("ground truth uses PATCH once and propagates commit failure", async () => {
  vi.mocked(backend.patchConversationGroundTruth).mockRejectedValue(new Error("commit failed"));
  await expect(runWithTenant("t", () => setConversationGroundTruth("c", null))).rejects.toThrow("commit failed");
  expect(backend.patchConversationGroundTruth).toHaveBeenCalledExactlyOnceWith("t", "c", null);
});

it("shadow reads return parity reports without filesystem writes", async () => {
  const { promises: fs } = await import("node:fs");
  const { loadStore } = await import("./store");
  const snapshot = await runWithTenant("t", () => readStore());
  const read = vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(snapshot));
  const write = vi.spyOn(fs, "writeFile");
  const mkdir = vi.spyOn(fs, "mkdir");
  try {
    const loaded = await runWithTenant("t", () => loadStore({ shadowConversations: true }));
    expect(loaded.conversationShadow?.equal).toBe(true);
    expect(loaded.conversationViewShadow?.equal).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  } finally { read.mockRestore(); write.mockRestore(); mkdir.mockRestore(); }
});

it("drops both shadow reports when an invalid feedback timestamp breaks the view comparison", async () => {
  const { promises: fs } = await import("node:fs");
  const { loadStore } = await import("./store");
  const snapshot = await runWithTenant("t", () => readStore());
  snapshot.signals = [{ id: "s", tenantId: "t", conversationId: "c", type: "lead",
    score: 0.9, confidence: 0.9, summary: "Synthetic", suggestedAction: "", evidence: [],
    status: "reviewed", createdAt: "2026-10-01T00:00:00Z",
    feedback: { label: "correct", reviewedAt: "invalid-timestamp" } }];
  const read = vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(snapshot));
  const persisted = vi.spyOn(reconciliation, "comparePersistedConversations");
  const views = vi.spyOn(reconciliation, "compareConversationViews");
  try {
    const loaded = await runWithTenant("t", () => loadStore({ shadowConversations: true }));
    expect((await persisted.mock.results[0].value).equal).toBe(true);
    expect(views.mock.results[0].type).toBe("throw");
    expect(loaded.conversationShadowReason).toBe("comparison_failed");
    expect(loaded.store.conversations.map((chat) => chat.id)).toEqual(["c"]);
    expect(loaded.conversationShadow).toBeUndefined();
    expect(loaded.conversationViewShadow).toBeUndefined();
  } finally { read.mockRestore(); persisted.mockRestore(); views.mockRestore(); }
});

it.each([
  ["malformed", "{"],
  ["wrong tenant", JSON.stringify({ tenant: { id: "other", name: "Other", createdAt: "2026-10-01T00:00:00Z" }, conversations: [], messages: [], signals: [] })],
])("ignores a %s shadow snapshot and returns the canonical store", async (_case, contents) => {
  const { promises: fs } = await import("node:fs");
  const { loadStore } = await import("./store");
  const read = vi.spyOn(fs, "readFile").mockResolvedValue(contents);
  try {
    const loaded = await runWithTenant("t", () => loadStore({ shadowConversations: true }));
    expect(loaded.store.conversations.map((conversation) => conversation.id)).toEqual(["c"]);
    expect(loaded.conversationShadow).toBeUndefined();
    expect(loaded.conversationViewShadow).toBeUndefined();
    expect(loaded.conversationShadowReason).toBe("snapshot_invalid");
  } finally { read.mockRestore(); }
});

it.each([
  ["missing", Object.assign(new Error("missing"), { code: "ENOENT" })],
  ["unreadable", new Error("permission denied")],
])("ignores a %s shadow snapshot", async (_case, failure) => {
  const { promises: fs } = await import("node:fs");
  const { loadStore } = await import("./store");
  const read = vi.spyOn(fs, "readFile").mockRejectedValue(failure);
  try {
    const loaded = await runWithTenant("t", () => loadStore({ shadowConversations: true }));
    expect(loaded.store.conversations.map((conversation) => conversation.id)).toEqual(["c"]);
    expect(loaded.conversationShadow).toBeUndefined();
    expect(loaded.conversationShadowReason).toBe(_case === "missing" ? "snapshot_missing" : "snapshot_unreadable");
  } finally { read.mockRestore(); }
});

it("restores persisted supervised decisions on canonical reads", async () => {
  vi.mocked(backend.getSupervisedActionDecisions).mockResolvedValue([{
    id: "decision-1",
    tenant_id: "t",
    conversation_id: "c",
    action_type: "lead_outreach_draft",
    status: "approved",
    subject: "Approved subject",
    body: "Approved body",
    evidence_quote: "Hello",
    created_at: "2026-10-01T00:00:00Z",
    decided_at: "2026-10-02T00:00:00Z",
  }]);
  const store = await runWithTenant("t", () => readStore());
  expect(store.supervisedActions).toEqual([
    expect.objectContaining({
      conversationId: "c",
      status: "approved",
      subject: "Approved subject",
      body: "Approved body",
    }),
  ]);
});

it("compares full snapshots while returning a fresh replace subset", async () => {
  const { promises: fs } = await import("node:fs");
  const { loadStore } = await import("./store");
  const old = { ...row, id: "old-uuid", conversation_id: "old", updated_at: "2026-09-01T00:00:00Z",
    messages: [{ ...row.messages[0], id: "old-message", conversation_id: "old", message_id: "old-m" }] };
  vi.mocked(backend.getPilotSettings).mockResolvedValue({ tenant_id: "t",
    last_uploaded_file_name: "Zerodha_week_4_batch_01.json", weekly_export_count: 2,
    updated_at: "2026-10-01T00:00:00Z" } as Awaited<ReturnType<typeof backend.getPilotSettings>>);
  vi.mocked(backend.getConversations).mockImplementation(async (_tenant, options) =>
    options?.updatedSince ? [row] : [row, old]);
  const snapshot = await runWithTenant("t", () => tryHydrateStoreFromNeon({ syncPredictions: false, shadowFullSnapshot: true }));
  const read = vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(snapshot));
  try {
    const loaded = await runWithTenant("t", () => loadStore({ freshOnly: true, shadowConversations: true }));
    expect(loaded.store.conversations.map(chat => chat.id)).toEqual(["c"]);
    expect(loaded.conversationShadow?.equal).toBe(true);
    expect(loaded.conversationViewShadow?.equal).toBe(true);
  } finally { read.mockRestore(); }
});

it("does not generate or log drafts for signals outside the dashboard keep-set during shadow comparison", async () => {
  const { promises: fs } = await import("node:fs");
  const { loadStore } = await import("./store");
  const hidden = { ...row, conversation_id: "hidden-chat", updated_at: "2026-09-01T00:00:00Z",
    messages: [{ ...row.messages[0], conversation_id: "hidden-chat", message_id: "hidden-message" }] };
  vi.mocked(backend.getPilotSettings).mockResolvedValue({ tenant_id: "t",
    last_uploaded_file_name: "Zerodha_week_4_batch_01.json", weekly_export_count: 2,
    updated_at: "2026-10-01T00:00:00Z" } as Awaited<ReturnType<typeof backend.getPilotSettings>>);
  vi.mocked(backend.getConversations).mockImplementation(async (_tenant, options) =>
    options?.updatedSince ? [row] : [row, hidden]);
  vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [{
    id: "hidden-prediction", tenant_id: "t", conversation_id: "hidden-chat",
    signal_type: "lead", confidence: 0.95, summary: "Synthetic lead",
    created_at: "2026-10-01T00:00:00Z",
  } as backend.BackendPredictionWithFeedback] });
  const snapshot = await runWithTenant("t", () => tryHydrateStoreFromNeon({ shadowFullSnapshot: true }));
  const read = vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(snapshot));
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const loaded = await runWithTenant("t", () => loadStore({ freshOnly: true, shadowConversations: true }));
    expect(loaded.store.conversations.map(chat => chat.id)).toEqual(["c"]);
    expect(loaded.store.signals).toEqual([]);
    expect(loaded.conversationViewShadow?.sourceCounts.signals).toBe(1);
    expect(loaded.conversationViewShadow?.targetCounts.signals).toBe(1);
    expect(loaded.conversationViewShadow?.equal).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain("hidden-prediction");
    expect(log.mock.calls.filter(([prefix]) => prefix === "[supervised-action]")).toEqual([]);
  } finally { read.mockRestore(); log.mockRestore(); }
});
