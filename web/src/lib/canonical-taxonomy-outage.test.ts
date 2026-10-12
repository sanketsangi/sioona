import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addTaxonomyOverride } from "./store";
import { runWithTenant } from "./tenant-context";
import * as backend from "./backend-client";

vi.mock("./backend-client", () => ({
  getPilotSettings: vi.fn(async () => null),
  getDetectionResume: vi.fn(async () => null),
  getActiveUploads: vi.fn(async () => []),
  getConversations: vi.fn(async () => [{
    tenant_id: "t", conversation_id: "c", channel: "chat",
    started_at: "2026-10-01T00:00:00Z", messages: [],
  }]),
  getSupervisedActionDecisions: vi.fn(async () => []),
  getTaxonomyOverrides: vi.fn(),
  putTaxonomyOverrides: vi.fn(async () => undefined),
  HYDRATE_CONVERSATIONS_TIMEOUT_MS: 1000,
}));
vi.mock("./fetch-tenant-signals", () => ({
  fetchTenantSignals: vi.fn(async () => ({ ok: true, rows: [] })),
}));

beforeEach(() => {
  vi.stubEnv("SIOONA_STATE_MODE", "postgres");
  vi.stubEnv("SIOONA_TAXONOMY_NEON", "1");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

it("refuses a taxonomy mutation after a failed canonical read without replacing saved phrases", async () => {
  vi.mocked(backend.getTaxonomyOverrides).mockRejectedValue(new Error("private backend detail"));
  await expect(runWithTenant("t", () => addTaxonomyOverride("lead", "phrases", "new phrase")))
    .rejects.toThrow("Canonical taxonomy read unavailable; retry the request.");
  expect(backend.putTaxonomyOverrides).not.toHaveBeenCalled();
});

it("retains existing phrases on a successful canonical mutation", async () => {
  vi.mocked(backend.getTaxonomyOverrides).mockResolvedValue({
    lead: { phrases: ["saved phrase"], keywords: [], negative_phrases: [] },
  });
  await runWithTenant("t", () => addTaxonomyOverride("lead", "phrases", "new phrase"));
  expect(backend.putTaxonomyOverrides).toHaveBeenCalledWith("t", {
    lead: { phrases: ["saved phrase", "new phrase"], keywords: [], negative_phrases: [] },
  });
});

it("accepts a successfully read empty canonical taxonomy", async () => {
  vi.mocked(backend.getTaxonomyOverrides).mockResolvedValue({});
  await runWithTenant("t", () => addTaxonomyOverride("lead", "phrases", "new phrase"));
  expect(backend.putTaxonomyOverrides).toHaveBeenCalledWith("t", {
    lead: { phrases: ["new phrase"], keywords: [], negative_phrases: [] },
  });
});
