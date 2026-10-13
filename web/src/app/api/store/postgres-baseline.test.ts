import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendConversation, BackendPilotSettings } from "@/lib/backend-client";
import * as backend from "@/lib/backend-client";
import { readStore } from "@/lib/store";
import { runWithTenant } from "@/lib/tenant-context";
import { POST } from "./route";

const conversation: BackendConversation = {
  id: "chat-row",
  tenant_id: "tenant_demo",
  conversation_id: "c1",
  channel: "chat",
  customer_name: null,
  external_id: null,
  started_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-04T00:00:00Z",
  messages: [{
    id: "message-row",
    tenant_id: "tenant_demo",
    conversation_id: "c1",
    message_id: "m1",
    role: "customer",
    content: "Synthetic customer message",
    timestamp: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
  }],
};

let pilot: BackendPilotSettings;
let putAttempts = 0;

function baselineRequest(baselineOpportunities: number, baselineNote: string) {
  return new Request("http://localhost/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_baseline", baselineOpportunities, baselineNote }),
  });
}

describe("Postgres set_baseline durability", () => {
  beforeEach(() => {
    putAttempts = 0;
    pilot = {
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note: "previous baseline",
      weekly_export_count: 2,
      last_uploaded_file_name: "week-export.csv",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    vi.stubEnv("SIOONA_TAXONOMY_NEON", "0");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network call")));
    vi.spyOn(backend, "getPilotSettings").mockImplementation(async () => structuredClone(pilot));
    vi.spyOn(backend, "getDetectionResume").mockResolvedValue(null);
    vi.spyOn(backend, "getActiveUploads").mockResolvedValue([]);
    vi.spyOn(backend, "getConversations").mockResolvedValue([conversation]);
    vi.spyOn(backend, "getTenantSignalsPage").mockResolvedValue({ predictions: [], next_cursor: null });
    vi.spyOn(backend, "getSupervisedActionDecisions").mockResolvedValue([]);
    vi.spyOn(backend, "putPilotSettings").mockImplementation(async (_tenant, input) => {
      putAttempts += 1;
      if (putAttempts === 1) throw new Error("database_unavailable");
      pilot = {
        ...pilot,
        baseline_opportunities: input.baseline_opportunities,
        baseline_note: input.baseline_note ?? null,
        weekly_export_count: input.weekly_export_count ?? null,
        last_uploaded_file_name: input.last_uploaded_file_name ?? null,
        updated_at: "2026-10-03T00:00:00Z",
      };
      return structuredClone(pilot);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a retryable failure when the pilot write fails, then keeps a successful retry", async () => {
    const { promises: fs } = await import("node:fs");
    const mkdir = vi.spyOn(fs, "mkdir");
    const writeFile = vi.spyOn(fs, "writeFile");
    const rename = vi.spyOn(fs, "rename");
    const failed = await POST(baselineRequest(12, "eval baseline"));
    expect(failed.status).toBe(503);
    expect((await failed.json()).error).toMatch(/retry/i);
    const unchanged = await runWithTenant("tenant_demo", () => readStore());
    expect(unchanged.pilot).toMatchObject({
      baselineOpportunities: 4,
      baselineNote: "previous baseline",
      weeklyExportCount: 2,
      lastUploadedFileName: "week-export.csv",
    });

    const saved = await POST(baselineRequest(12, "eval baseline"));
    expect(saved.status).toBe(200);
    const persisted = await runWithTenant("tenant_demo", () => readStore());
    expect(persisted.pilot).toMatchObject({
      baselineOpportunities: 12,
      baselineNote: "eval baseline",
      weeklyExportCount: 2,
      lastUploadedFileName: "week-export.csv",
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });
});
