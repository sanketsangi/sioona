import { readWebhookJson, WebhookBodyTooLarge } from "@/lib/bounded-webhook-json";
import { runWithTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";
import { acceptLiveChats } from "@/lib/live-ingest/accept";
import {
  bindLiveIngestTenant,
  liveIngestEnabled,
  webhookSecretMatches,
} from "@/lib/live-ingest/flag";
import { parseWhatsAppWebhook } from "@/lib/live-ingest/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!liveIngestEnabled()) {
    return NextResponse.json({ error: "live_ingest_disabled" }, { status: 404 });
  }
  if (
    !webhookSecretMatches(
      request.headers.get("x-sioona-webhook-secret"),
      process.env.WHATSAPP_WEBHOOK_SECRET,
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenantId = bindLiveIngestTenant(request);
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runWithTenant(tenantId, async () => {
  const provider = new URL(request.url).searchParams.get("provider") || "gupshup";
  let body: unknown;
  try { body = await readWebhookJson(request); }
  catch (error) {
    return NextResponse.json({ error: error instanceof WebhookBodyTooLarge ? "webhook_body_too_large" : "invalid_webhook_json" },
      { status: error instanceof WebhookBodyTooLarge ? 413 : 400 });
  }
  const chats = parseWhatsAppWebhook(provider, body);
  try {
    const result = await acceptLiveChats(chats);
    return NextResponse.json({ accepted: result.accepted, sent: false });
  } catch {
    return NextResponse.json({ error: "live_ingest_not_published", sent: false },
      { status: 503, headers: { "Retry-After": "30" } });
  }
  });
}
