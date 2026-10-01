/**
 * Print a scrypt hash for SIOONA_PILOT_USERS passwordHash.
 * Usage: node web/scripts/hash-pilot-password.mjs "the password"
 */
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node web/scripts/hash-pilot-password.mjs <password>");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
process.stdout.write(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}\n`);
