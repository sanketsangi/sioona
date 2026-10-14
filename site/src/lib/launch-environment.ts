import { resolveSiteUrl, resolveAppUrl, siteConfig } from "./site";
import { contactPolicy } from "./contact-policy";
/** Fail closed at startup when mandatory runtime facts are missing or public origins differ from the build. */
export function assertLaunchEnvironment(env: Record<string, string | undefined> = process.env) {
  const url = resolveSiteUrl(env);
  const appUrl = resolveAppUrl(env);
  const policy = contactPolicy({ ...env });
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    if (process.env.NEXT_PUBLIC_CONTACT_POLICY && JSON.stringify(policy) !== process.env.NEXT_PUBLIC_CONTACT_POLICY) throw new Error("Public policy differs from this build. Rebuild with approved policy values.");
    if (url !== siteConfig.url || appUrl !== siteConfig.appUrl) throw new Error("Public origins differ from this build. Rebuild with the intended production environment.");
  }
}
