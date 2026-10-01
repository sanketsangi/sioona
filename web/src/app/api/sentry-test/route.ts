/**
 * Temporary verification trigger that goes through real Sentry init.
 * Delete this file when you no longer need a local error probe.
 *
 * GET /api/sentry-test
 * Allowed in development, or in any env when SENTRY_TEST_TRIGGER=1.
 */
import { NextResponse } from "next/server";

import { authEnforced } from "@/lib/auth-token";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (authEnforced()) {
    const session = await requireApiSession(request, "read");
    if (session instanceof NextResponse) return session;
    if (session.role !== "admin") {
      return new Response("Not Found", { status: 404 });
    }
  }
  const allowed =
    process.env.NODE_ENV !== "production" ||
    process.env.SENTRY_TEST_TRIGGER === "1";

  if (!allowed) {
    return new Response("Not Found", { status: 404 });
  }

  throw new Error("Sentry test error — delete src/app/api/sentry-test");
}
