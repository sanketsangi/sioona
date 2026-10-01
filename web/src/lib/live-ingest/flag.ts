/**
 * Live read-only connectors. Off unless LIVE_INGEST=1.
 * Nothing here sends a message to a customer.
 */

import { timingSafeEqual } from "crypto";
import { isTenantId } from "@/lib/auth-token";
import { DEMO_TENANT_ID, enterStoreTenant } from "@/lib/tenant-context";

export const LIVE_INGEST_TENANT_HEADER = "x-sioona-tenant-id";

export function liveIngestEnabled(): boolean {
  return process.env.LIVE_INGEST === "1";
}

/**
 * Webhooks name their tenant. The header must be a real tenant id.
 * When `SIOONA_TENANT_ID` is set, the header has to match it.
 * The showcase tenant is never a live-ingest target.
 */
export function resolveLiveIngestTenant(header: string | null): string | null {
  const provided = header?.trim() ?? "";
  if (!isTenantId(provided) || provided === DEMO_TENANT_ID) return null;
  const configured = process.env.SIOONA_TENANT_ID?.trim() ?? "";
  if (configured) {
    if (!isTenantId(configured) || configured === DEMO_TENANT_ID) return null;
    if (provided !== configured) return null;
  }
  return provided;
}

/** Bind the JSON store to the webhook tenant. Null when the header is unusable. */
export function bindLiveIngestTenant(request: Request): string | null {
  const tenantId = resolveLiveIngestTenant(
    request.headers.get(LIVE_INGEST_TENANT_HEADER),
  );
  if (!tenantId) return null;
  enterStoreTenant(tenantId);
  return tenantId;
}

export function webhookSecretMatches(
  provided: string | null,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
