import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { liveIngestEnabled } from "@/lib/live-ingest/flag";
import {
  INTERCOM_OAUTH_STATE_COOKIE,
  intercomOAuthStartUrl,
} from "@/lib/live-ingest/intercom";

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
  const state = randomBytes(32).toString("base64url");
  const url = intercomOAuthStartUrl(
    clientId,
    `${origin}/api/ingest/live/intercom/callback`,
    state,
  );
  const response = NextResponse.redirect(url);
  response.cookies.set(INTERCOM_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/ingest/live/intercom",
    maxAge: 600,
  });
  return response;
}
