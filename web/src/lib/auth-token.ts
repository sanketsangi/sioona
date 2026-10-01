/**
 * Signed httpOnly session for a small B2B pilot.
 *
 * Not Auth0: one or two named reviewers, no IdP, no callback URLs.
 * The cookie carries role + tenant. The browser cannot pick another tenant.
 * FastAPI trusts a separate service token that only this server holds.
 */

export const SESSION_COOKIE = "sioona_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 12;

export type AuthRole = "admin" | "reviewer" | "demo";

export type SessionClaims = {
  email: string;
  role: AuthRole;
  tenantId: string;
  exp: number;
};

const TENANT_RE = /^tenant_[a-z0-9_]{1,64}$/;

export function authEnforced(): boolean {
  if (process.env.SIOONA_AUTH_ENFORCE === "0") return false;
  if (process.env.SIOONA_AUTH_ENFORCE === "1") return true;
  if (process.env.VITEST === "true") return false;
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return true;
  }
  return Boolean(process.env.AUTH_SECRET?.trim());
}

/**
 * Anonymous read of the demo tenant.
 * Production stays closed until SIOONA_PUBLIC_DEMO=1 so historical
 * tenant_demo rows are not readable without a session.
 */
export function publicDemoEnabled(): boolean {
  if (process.env.SIOONA_PUBLIC_DEMO === "1") return true;
  if (process.env.SIOONA_PUBLIC_DEMO === "0") return false;
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return false;
  }
  return true;
}

/** Reset / Partner Demo. Off in production unless explicitly allowed. */
export function demoActionsAllowed(): boolean {
  const production =
    process.env.VERCEL_ENV === "production" ||
    process.env.SIOONA_ENV === "production";
  if (!production) return true;
  return process.env.SIOONA_ALLOW_DEMO_ACTIONS === "1";
}

function authSecret(): string {
  return process.env.AUTH_SECRET?.trim() ?? "";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

function signaturesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isTenantId(value: string): boolean {
  return TENANT_RE.test(value);
}

export async function signSession(
  claims: Omit<SessionClaims, "exp"> & { exp?: number },
): Promise<string> {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET is not set");
  if (!isTenantId(claims.tenantId)) {
    throw new Error("tenantId must look like tenant_acme");
  }
  const body: SessionClaims = {
    email: claims.email,
    role: claims.role,
    tenantId: claims.tenantId,
    exp: claims.exp ?? Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  };
  const payload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const sig = await hmacSha256(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  const secret = authSecret();
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = await hmacSha256(payload, secret);
  if (!signaturesMatch(expected, sig)) return null;
  try {
    const claims = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payload)),
    ) as SessionClaims;
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (
      claims.role !== "admin" &&
      claims.role !== "reviewer" &&
      claims.role !== "demo"
    ) {
      return null;
    }
    if (!isTenantId(claims.tenantId) || !claims.email) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAge = SESSION_MAX_AGE_SEC): string {
  const secure =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}
