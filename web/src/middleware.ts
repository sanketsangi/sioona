import { NextResponse } from "next/server";

import {
  authEnforced,
  inspectSessionToken,
  publicDemoEnabled,
  readCookie,
  SESSION_COOKIE,
} from "@/lib/auth-token";
import { isLiveIngestWebhook } from "@/lib/live-ingest-paths";

/**
 * Mutation gate. Route handlers repeat the role check so a missed matcher
 * still fails closed. Reads stay open only for the public demo tenant.
 */
export async function middleware(request: Request) {
  if (!authEnforced()) return NextResponse.next();

  const { pathname } = new URL(request.url);
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/backend-health") ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  const method = request.method.toUpperCase();
  if (isLiveIngestWebhook(pathname, method)) return NextResponse.next();

  const inspected = await inspectSessionToken(
    readCookie(request.headers.get("cookie"), SESSION_COOKIE),
  );
  if (
    !inspected.ok &&
    (inspected.reason === "expired" || inspected.reason === "invalid")
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Sign in required.", loginPath: "/login" },
        { status: 401 },
      );
    }
    if (method === "GET" || method === "HEAD") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }
  const session = inspected.ok ? inspected.claims : null;

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    if (session || publicDemoEnabled() || !pathname.startsWith("/api/")) {
      if (!session && !publicDemoEnabled() && !pathname.startsWith("/api/")) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!session || session.role === "demo") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
