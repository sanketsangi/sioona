import { NextResponse } from "next/server";
import { liveIngestEnabled } from "@/lib/live-ingest/flag";
import { intercomOAuthStartUrl } from "@/lib/live-ingest/intercom";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!liveIngestEnabled()) {
    return NextResponse.json({ error: "live_ingest_disabled" }, { status: 404 });
  }
  const clientId = process.env.INTERCOM_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "intercom_client_id_missing" }, { status: 503 });
  }
  const origin = new URL(request.url).origin;
  const url = intercomOAuthStartUrl(
    clientId,
    `${origin}/api/ingest/live/intercom/callback`,
    process.env.INTERCOM_WEBHOOK_SECRET?.trim() || "sioona",
  );
  return NextResponse.redirect(url);
}
