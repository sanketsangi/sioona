/** Operator-supplied public facts. Empty values never become invented policy. */
export function contactPolicy(env: Record<string, string | undefined> = process.env) {
  const email = env.PILOT_CONTACT_SUPPORT_EMAIL?.trim() || "";
  const policy = {
    supportEmail: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ? email : "",
    retention: env.PILOT_CONTACT_RETENTION?.trim() || "",
    hostingRegion: env.PILOT_CONTACT_HOSTING_REGION?.trim() || "",
  };
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    if (!policy.supportEmail || !policy.retention || !policy.hostingRegion) throw new Error("Production requires PILOT_CONTACT_SUPPORT_EMAIL, PILOT_CONTACT_RETENTION and PILOT_CONTACT_HOSTING_REGION");
  }
  return policy;
}
