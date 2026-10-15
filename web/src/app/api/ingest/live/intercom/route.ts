import { NextResponse } from "next/server";
import { LIVE_INGEST_PRINCIPAL } from "@/lib/actor-assertion";
import { acceptIntercomEvent, runWithServicePrincipal } from "@/lib/backend-client";
import { WebhookBodyTooLarge } from "@/lib/bounded-webhook-json";
import { liveIngestEnabled } from "@/lib/live-ingest/flag";
import { verifyIntercomEvent, IntercomVerificationError } from "@/lib/live-ingest/intercom-verified";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!liveIngestEnabled()) return NextResponse.json({ error: "live_ingest_disabled" }, { status: 404 });
  try {
    const { tenantId, event } = await verifyIntercomEvent(request);
    const receipt = await runWithServicePrincipal(LIVE_INGEST_PRINCIPAL, tenantId,
      () => acceptIntercomEvent(tenantId, event));
    return NextResponse.json({ ...receipt, sent: false }, { status: 202 });
  } catch (error) {
    if (error instanceof WebhookBodyTooLarge) return NextResponse.json({ error: "webhook_body_too_large" }, { status: 413 });
    if (error instanceof IntercomVerificationError) return NextResponse.json({ error: "invalid_intercom_event" }, { status: error.status });
    // No acknowledgment until durable acceptance; never expose provider/customer text.
    return NextResponse.json({ error: "live_ingest_not_persisted", sent: false },
      { status: 503, headers: { "Retry-After": "30" } });
  }
}
