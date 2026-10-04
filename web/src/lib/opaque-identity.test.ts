import { afterEach, describe, expect, it, vi } from "vitest";
import { opaqueExternalIdentity } from "./opaque-identity";
import { toStoreRecords } from "./ingest";

afterEach(() => vi.unstubAllEnvs());

describe("opaque partner identities", () => {
  it("separates tenant, provider, case, punctuation, and full long identifiers", () => {
    const values = ["Client-A", "client-a", "Client_A", "x".repeat(60) + "a", "x".repeat(60) + "b"];
    const hashes = values.map((value) => opaqueExternalIdentity("tenant_a", "csv", value));
    expect(new Set(hashes).size).toBe(values.length);
    expect(opaqueExternalIdentity("tenant_b", "csv", values[0])).not.toBe(hashes[0]);
    expect(opaqueExternalIdentity("tenant_a", "intercom", values[0])).not.toBe(hashes[0]);
    expect(opaqueExternalIdentity("tenant_a", "csv", values[0])).toBe(hashes[0]);
  });

  it("stores neither the phone nor its characters in conversation, message or external IDs", () => {
    const inputs = [{ externalId: "+91 9876543210", messages: [{ role: "customer" as const, content: "Call +91 9876543210" }] }];
    const first = toStoreRecords(inputs, "tenant_partner", { stableIds: true, provider: "csv" });
    const second = toStoreRecords(inputs, "tenant_partner", { stableIds: true, provider: "csv" });
    expect(first.conversations[0].id).toMatch(/^conv_[a-f0-9]{64}$/);
    expect(first.conversations[0].externalId).toMatch(/^ext_[a-f0-9]{64}$/);
    expect(first.conversations[0].id).toBe(second.conversations[0].id);
    expect(JSON.stringify(first)).not.toContain("9876543210");
  });

  it("fails before persistence when the production secret is missing", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SIOONA_IDENTITY_KEY", "");
    expect(() => opaqueExternalIdentity("tenant_partner", "csv", "external")).toThrow("SIOONA_IDENTITY_KEY");
  });
});
