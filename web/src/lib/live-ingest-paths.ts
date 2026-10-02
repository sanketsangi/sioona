/**
 * Edge-safe: imported by middleware, so no Node-only modules here.
 *
 * Webhook and poll callers never hold a browser session. These routes check
 * the LIVE_INGEST flag, a shared secret, and a non-demo tenant header
 * themselves. OAuth start and callback are not listed: the signed-in operator
 * reaches them, and Lax cookies ride top-level redirects.
 */
const LIVE_INGEST_WEBHOOK_POSTS = new Set([
  "/api/ingest/live/intercom",
  "/api/ingest/live/intercom/poll",
  "/api/ingest/live/whatsapp",
]);

export function isLiveIngestWebhook(pathname: string, method: string): boolean {
  if (process.env.LIVE_INGEST !== "1") return false;
  if (method.toUpperCase() !== "POST") return false;
  return LIVE_INGEST_WEBHOOK_POSTS.has(pathname);
}
