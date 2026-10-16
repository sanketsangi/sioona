import type { Metadata } from "next";

type Environment = Record<string, string | undefined>;

function publicCode(env: Environment, name: string): string | undefined {
  const value = env[name]?.trim();
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(value)) throw new Error(`${name} must contain only the verification code, not a meta tag or credentials`);
  return value;
}

/** Public ownership codes, not OAuth secrets or API keys. Rebuild after changing. */
export function searchVerification(env: Environment = process.env): NonNullable<Metadata["verification"]> {
  const google = publicCode(env, "GOOGLE_SITE_VERIFICATION");
  const bing = publicCode(env, "BING_SITE_VERIFICATION");
  const ahrefs = publicCode(env, "AHREFS_SITE_VERIFICATION");
  const other = { ...(bing ? { "msvalidate.01": bing } : {}), ...(ahrefs ? { "ahrefs-site-verification": ahrefs } : {}) };
  return { ...(google ? { google } : {}), ...(Object.keys(other).length ? { other } : {}) };
}

/** IndexNow ownership token; generated/configured by the operator, never invented. */
export function indexNowKey(env: Environment = process.env): string | null {
  const value = env.INDEXNOW_KEY?.trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9-]{8,128}$/.test(value)) throw new Error("INDEXNOW_KEY must be 8–128 letters, digits or dashes");
  return value;
}
