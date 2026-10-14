import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { loadPilotUsers, type PilotUser } from "./auth-accounts";
export { loadPilotUsers, type PilotUser, type PilotRole } from "./auth-accounts";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function passwordsMatch(input: string, stored: string): boolean {
  return timingSafeEqual(sha256(input), sha256(stored));
}

/** `scrypt$<saltHex>$<hashHex>` from `node web/scripts/hash-pilot-password.mjs`. */
export function hashPilotPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyScrypt(password: string, stored: string): boolean {
  // Only accept the fixed salt/key sizes emitted by hashPilotPassword.
  // Buffer's permissive hex decoding must not turn malformed configuration
  // into an empty key or an unbounded scrypt allocation during login.
  const match = /^scrypt\$([a-fA-F0-9]{32})\$([a-fA-F0-9]{64})$/.exec(stored);
  if (!match) return false;
  const [, saltHex, hashHex] = match;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function verifyPilotPassword(input: string, user: PilotUser): boolean {
  if (user.passwordHash) return verifyScrypt(input, user.passwordHash);
  if (!user.password) return false;
  return passwordsMatch(input, user.password);
}

export function authenticatePilotUser(
  email: string,
  password: string,
): PilotUser | null {
  const needle = email.trim().toLowerCase();
  if (!needle || !password) return null;
  for (const user of loadPilotUsers()) {
    if (user.email !== needle) continue;
    if (!verifyPilotPassword(password, user)) return null;
    if (user.tenantId === "tenant_demo") return null;
    return user;
  }
  return null;
}
