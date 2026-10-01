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
  if (!bindLiveIngestTenant(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const provider = new URL(request.url).searchParams.get("provider") || "gupshup";
  const body = (await request.json().catch(() => null)) as unknown;
  const chats = parseWhatsAppWebhook(provider, body);
  const result = await acceptLiveChats(chats);
  return NextResponse.json({ accepted: result.accepted, sent: false });
}
