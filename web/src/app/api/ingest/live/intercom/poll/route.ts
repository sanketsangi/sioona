import { runWithTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";
import { acceptLiveChats } from "@/lib/live-ingest/accept";
import {
  bindLiveIngestTenant,
  liveIngestEnabled,
  webhookSecretMatches,
} from "@/lib/live-ingest/flag";
import { pollIntercomConversations } from "@/lib/live-ingest/intercom";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!liveIngestEnabled()) {
    return NextResponse.json({ error: "live_ingest_disabled" }, { status: 404 });
  }
  if (
    !webhookSecretMatches(
      request.headers.get("x-sioona-webhook-secret"),
      process.env.INTERCOM_WEBHOOK_SECRET,
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenantId = bindLiveIngestTenant(request);
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runWithTenant(tenantId, async () => {
  const token = process.env.INTERCOM_ACCESS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "intercom_access_token_missing" }, { status: 503 });
  }
  try {
    const chats = await pollIntercomConversations(token);
    try {
      const result = await acceptLiveChats(chats);
      return NextResponse.json({ accepted: result.accepted, sent: false });
    } catch {
      return NextResponse.json({ error: "live_ingest_not_published", sent: false },
        { status: 503, headers: { "Retry-After": "30" } });
    }
  } catch {
    return NextResponse.json({ error: "intercom_poll_failed" }, { status: 502 });
  }
  });
}
