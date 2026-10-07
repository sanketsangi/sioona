// Server-only. Mints the 60-second actor assertion FastAPI verifies.
import { createHash, createHmac, randomUUID } from "node:crypto";

export const ACTOR_NAMESPACE = "6f1b9c0e-7a2d-4c31-9e4a-cb0300000001";
export const ACTOR_USER_ID_VECTOR_EMAIL = "reviewer@example.test";
export const ACTOR_USER_ID_VECTOR = "4f79ac56-3a83-5f2a-b143-dafc406b7c28";
export const DEMO_ACTOR_EMAIL = "demo@sioona.ai";
export const LIVE_INGEST_PRINCIPAL = "principal:live-ingest";

const b64 = (value: string) => Buffer.from(value).toString("base64url");

export function actorUserId(email: string): string {
  const namespace = Buffer.from(ACTOR_NAMESPACE.replace(/-/g, ""), "hex");
  const name = Buffer.from(email.trim().toLowerCase(), "utf8");
  const hash = createHash("sha1").update(namespace).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function signActorAssertion(
  sub: string,
  tid: string,
  key: string,
  ttlSeconds = 60,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({
      iss: "sioona-web",
      aud: "sioona-api",
      sub,
      tid,
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
      jti: randomUUID(),
    }),
  );
  const signature = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function readActorClaims(token: string): {
  iss: string;
  aud: string;
  sub: string;
  tid: string;
  iat: number;
  exp: number;
  jti: string;
} {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("invalid_actor");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
