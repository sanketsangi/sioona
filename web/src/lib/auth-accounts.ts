import { isTenantId, type AuthRole } from "./auth-token";

/**
 * Password accounts. `demo` stays a session-only role for the anonymous
 * public demo (`auth-guard` demo session). It is not a sign-in role.
 */
export type PilotRole = Exclude<AuthRole, "demo">;

export type PilotUser = {
  email: string;
  role: PilotRole;
  tenantId: string;
  password?: string;
  passwordHash?: string;
};

function asRole(value: unknown): PilotRole | null {
  if (value === "admin" || value === "reviewer") return value;
  return null;
}

function normalizeUser(raw: unknown): PilotUser | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const role = asRole(row.role);
  const tenantId = typeof row.tenantId === "string" ? row.tenantId.trim() : "";
  const password = typeof row.password === "string" ? row.password : undefined;
  const passwordHash =
    typeof row.passwordHash === "string" ? row.passwordHash : undefined;
  if (!email || !role || !isTenantId(tenantId)) return null;
  if (!password && !passwordHash) return null;
  return { email, role, tenantId, password, passwordHash };
}

/**
 * Pilot accounts from env. Prefer `SIOONA_PILOT_USERS` (JSON).
 * Otherwise one admin and an optional reviewer sharing `SIOONA_TENANT_ID`.
 * That id must not be `tenant_demo` — the public demo tenant is isolated.
 */
export function loadPilotUsers(): PilotUser[] {
  const raw = process.env.SIOONA_PILOT_USERS?.trim();
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("SIOONA_PILOT_USERS is not valid JSON");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("SIOONA_PILOT_USERS must be a JSON array");
    }
    return parsed
      .map(normalizeUser)
      .filter((user): user is PilotUser => user !== null);
  }

  const tenantId = process.env.SIOONA_TENANT_ID?.trim() || "tenant_partner";
  if (!isTenantId(tenantId)) return [];
  const users: PilotUser[] = [];
  const adminEmail = process.env.SIOONA_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SIOONA_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    users.push({
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      tenantId,
    });
  }
  const reviewerEmail = process.env.SIOONA_REVIEWER_EMAIL?.trim().toLowerCase();
  const reviewerPassword = process.env.SIOONA_REVIEWER_PASSWORD;
  if (reviewerEmail && reviewerPassword) {
    users.push({
      email: reviewerEmail,
      password: reviewerPassword,
      role: "reviewer",
      tenantId,
    });
  }
  return users;
}

