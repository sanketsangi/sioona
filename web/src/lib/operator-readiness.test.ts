import { afterEach, expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({
  getInferenceControls: vi.fn(),
  getEconomicsDashboard: vi.fn(),
}));
import { getInferenceControls, getEconomicsDashboard } from "./backend-client";
import { readOperatorReadiness, safeRevision } from "./operator-readiness";
import { bootstrapEvidence } from "./operator-readiness-evidence";
import { readFileSync } from "node:fs";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("never promotes failed observations into passing readiness or leaks backend errors", async () => {
  vi.mocked(getInferenceControls).mockRejectedValue(new Error("secret-db-url"));
  vi.mocked(getEconomicsDashboard).mockRejectedValue(new Error("secret-token"));
  const result = await readOperatorReadiness("verified-tenant");
  expect(result.controls).toBeNull();
  expect(result.ledger).toBeNull();
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(getInferenceControls).toHaveBeenCalledWith("verified-tenant");
  expect(getEconomicsDashboard).toHaveBeenCalledWith("verified-tenant");
});
it("rejects revision strings that could contain credentials or arbitrary HTML", () => {
  expect(safeRevision("https://secret@host")).toBeNull();
  expect(safeRevision("a".repeat(40))).toBe("a".repeat(40));
});
it("keeps the allowlisted historical receipt aligned with its owning source", () => {
  const receipt = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/development/evidence/staging-bootstrap-receipt.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(bootstrapEvidence.timestamp).toBe(receipt.timestamp_utc);
  expect(bootstrapEvidence.schema).toBe(receipt.migrations.head_applied);
  expect(bootstrapEvidence.memberships).toBe(
    receipt.synthetic_seed.memberships_upserted,
  );
});

it("retains measured control and ledger observations without turning unknown metrics into zero",async()=>{
 vi.mocked(getInferenceControls).mockResolvedValue({enabled:false,daily_attempt_limit:500,run_attempt_limit:120});
 vi.mocked(getEconomicsDashboard).mockResolvedValue({from_ts:"2026-10-01T00:00:00Z",to_ts:"2026-10-18T00:00:00Z",economics:{attempts:7,unknown_usage_count:2,unknown_cost_count:3},reliability:{unfinished_attempts:1,reservation_drift:{status:"unavailable",reason:"no_samples"},ledger_flush_failures:{status:"available",value:0,unit:"failures",samples:4,reason:"observed"}}} as never);
 const result=await readOperatorReadiness("tenant_a");expect(result.controls).toEqual({enabled:false,daily_attempt_limit:500,run_attempt_limit:120});expect(result.ledger).toMatchObject({attempts:7,unfinished:1,unknownUsage:2,unknownCost:3,reservationDrift:{status:"unavailable"},flushFailures:{status:"available",value:0,samples:4}});
});
