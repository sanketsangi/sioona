import { NextResponse } from "next/server";

import {
  authEnforced,
  demoActionsAllowed,
  publicDemoEnabled,
  readCookie,
  SESSION_COOKIE,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/auth-token";
import { DEMO_TENANT_ID, enterStoreTenant } from "@/lib/tenant-context";

export type AuthIntent = "read" | "mutate" | "destructive";

export type GuardSuccess = { ok: true; session: SessionClaims };
export type GuardFailure = { ok: false; response: NextResponse };

const DEV_SESSION: SessionClaims = {
  email: "dev@localhost",
  role: "admin",
  tenantId: DEMO_TENANT_ID,
  exp: Number.MAX_SAFE_INTEGER,
};

function demoSession(): SessionClaims {
  return {
    email: "demo@sioona.ai",
    role: "demo",
    tenantId: DEMO_TENANT_ID,
    exp: Number.MAX_SAFE_INTEGER,
  };
}

export async function sessionFromRequest(
  request: Request,
): Promise<SessionClaims | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  return verifySessionToken(token);
}

/**
 * Authorize one API call and bind the JSON store to that tenant.
 * Destructive demo actions always bind to tenant_demo, never the partner tenant.
 */
export async function guardApi(
  request: Request,
  intent: AuthIntent,
): Promise<GuardSuccess | GuardFailure> {
  if (!authEnforced()) {
    const session =
      intent === "destructive"
        ? { ...DEV_SESSION, tenantId: DEMO_TENANT_ID }
        : DEV_SESSION;
    enterStoreTenant(session.tenantId);
    return { ok: true, session };
  }

  const signedIn = await sessionFromRequest(request);

  if (intent === "read") {
    if (signedIn) {
      enterStoreTenant(signedIn.tenantId);
      return { ok: true, session: signedIn };
    }
    if (!publicDemoEnabled()) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Sign in required." },
          { status: 401 },
        ),
      };
    }
    const session = demoSession();
    enterStoreTenant(session.tenantId);
    return { ok: true, session };
  }

  if (!signedIn || signedIn.role === "demo") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sign in required." },
        { status: 401 },
      ),
    };
  }

  if (intent === "destructive") {
    if (signedIn.role !== "admin") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Admin role required." },
          { status: 403 },
        ),
      };
    }
    if (!demoActionsAllowed()) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "Reset and Partner Demo are disabled in production. Set SIOONA_ALLOW_DEMO_ACTIONS=1 to enable them for admins.",
          },
          { status: 403 },
        ),
      };
    }
    const session = { ...signedIn, tenantId: DEMO_TENANT_ID };
    enterStoreTenant(DEMO_TENANT_ID);
    return { ok: true, session };
  }

  enterStoreTenant(signedIn.tenantId);
  return { ok: true, session: signedIn };
}

export async function requireApiSession(
  request: Request,
  intent: AuthIntent,
): Promise<SessionClaims | NextResponse> {
  const guard = await guardApi(request, intent);
  if (!guard.ok) return guard.response;
  return guard.session;
}
