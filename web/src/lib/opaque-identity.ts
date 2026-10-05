import { createHmac, randomUUID } from "node:crypto";

/** A dedicated stable secret: changing it requires an explicit identity migration. */
function identityKey(): string {
  const key = process.env.SIOONA_IDENTITY_KEY;
  if (key && key.length >= 32) return key;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("SIOONA_IDENTITY_KEY must contain at least 32 characters before partner ingestion.");
  }
  return "sioona-local-rehearsal-identity-key-v1";
}

export function opaqueExternalIdentity(tenantId: string, provider: string, externalId?: string): string {
  // Preserve case, punctuation and the full identifier. JSON framing prevents
  // ambiguous concatenation, and tenant/provider scope prevents cross-tenant joins.
  const raw = externalId?.trim() || `generated:${randomUUID()}`;
  return createHmac("sha256", identityKey())
    .update(JSON.stringify(["sioona-identity-v1", tenantId, provider, raw])).digest("hex");
}
