/** Operator-supplied public facts. Empty values never become invented policy. */
export function contactPolicy(env: Record<string, string | undefined> = process.env) {
  const email = env.PILOT_CONTACT_SUPPORT_EMAIL?.trim() || "";
  const policy = {
    supportEmail: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ? email : "",
    retention: env.PILOT_CONTACT_RETENTION?.trim() || "",
    hostingRegion: env.PILOT_CONTACT_HOSTING_REGION?.trim() || "",
  };
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    if (!policy.hostingRegion) throw new Error("Production requires PILOT_CONTACT_HOSTING_REGION");
    if (email && !policy.supportEmail) throw new Error("PILOT_CONTACT_SUPPORT_EMAIL must be a valid email when configured");
  }
  return policy;
}

export function contactPolicyText(policy = contactPolicy()): string[] {
  return [
    policy.retention ? `Contact-data retention: ${policy.retention}` : "A standard contact-data retention period is not published yet.",
    policy.hostingRegion ? `Pilot request database hosting region: ${policy.hostingRegion}` : "The pilot request database hosting region is not published yet.",
    policy.supportEmail ? `For access, correction, deletion or help with a pilot request, email ${policy.supportEmail}.` : "For access, correction, deletion or help with a pilot request, use the contact form.",
  ];
}
