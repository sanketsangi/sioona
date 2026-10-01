import { NextResponse } from "next/server";
import { liveIngestEnabled } from "@/lib/live-ingest/flag";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Does not exchange or store the code.
 * The operator sets INTERCOM_ACCESS_TOKEN in the environment, then polls.
 */
export async function GET(request: Request) {
  if (!liveIngestEnabled()) {
    return NextResponse.json({ error: "live_ingest_disabled" }, { status: 404 });
  }
  const state = new URL(request.url).searchParams.get("state");
  const expected = process.env.INTERCOM_WEBHOOK_SECRET?.trim();
  if (!state || !expected || state !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    stored: false,
    sent: false,
    next: "Set INTERCOM_ACCESS_TOKEN in the server environment, then POST /api/ingest/live/intercom/poll.",
  });
}
