import { NextResponse } from "next/server";
import { liveIngestEnabled, webhookSecretMatches } from "@/lib/live-ingest/flag";
import {
  INTERCOM_OAUTH_STATE_COOKIE,
  readRequestCookie,
} from "@/lib/live-ingest/intercom";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Does not exchange or store the code.
 * The operator sets INTERCOM_ACCESS_TOKEN in the environment, then polls.
 */
function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.set(INTERCOM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/ingest/live/intercom",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  if (!liveIngestEnabled()) {
    return NextResponse.json({ error: "live_ingest_disabled" }, { status: 404 });
  }
  const state = new URL(request.url).searchParams.get("state");
  const expected = readRequestCookie(request, INTERCOM_OAUTH_STATE_COOKIE);
  if (!webhookSecretMatches(state, expected)) {
    return clearStateCookie(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
  }
  return clearStateCookie(
    NextResponse.json({
      ok: true,
      stored: false,
      sent: false,
      next: "Set INTERCOM_ACCESS_TOKEN in the server environment, then POST /api/ingest/live/intercom/poll.",
    }),
  );
}
