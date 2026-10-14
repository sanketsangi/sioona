export const VARY = "Accept, Origin, rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;
export const publicHeaders = { ...securityHeaders, Vary: VARY };
