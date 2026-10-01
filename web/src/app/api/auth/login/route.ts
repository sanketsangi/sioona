import { NextResponse } from "next/server";

import { sessionCookie, signSession } from "@/lib/auth-token";
import { authenticatePilotUser } from "@/lib/auth-users";

export const dynamic = "force-dynamic";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Enter email and password." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.trim() || !password) {
    return NextResponse.json(
      { error: "Enter email and password." },
      { status: 400 },
    );
  }

  let user: ReturnType<typeof authenticatePilotUser>;
  try {
    user = authenticatePilotUser(email, password);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sign-in is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 },
    );
  }

  const token = await signSession({
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  });
  const response = NextResponse.json({
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  });
  response.headers.set("Set-Cookie", sessionCookie(token));
  return response;
}
