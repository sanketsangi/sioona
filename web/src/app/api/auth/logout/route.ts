import { NextResponse } from "next/server";

import { SESSION_COOKIE, sessionCookie } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", sessionCookie("", 0));
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
  return response;
}
