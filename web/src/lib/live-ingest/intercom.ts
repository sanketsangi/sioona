import { readWebhookJson } from "../bounded-webhook-json";
/**
 * Intercom read-only connector: OAuth start URL, webhook body, and a GET poll.
 * The access token stays in the environment. This module never posts a reply.
 */

import { parseIntercomJson } from "../ingest-platforms";
import type { IngestConversationInput } from "../ingest-platforms";

const INTERCOM_CONVERSATIONS_URL =
  "https://api.intercom.io/conversations?per_page=20";

/** Short-lived CSRF nonce. Never the webhook secret. */
export const INTERCOM_OAUTH_STATE_COOKIE = "intercom_oauth_state";

export function readRequestCookie(
  request: Request,
  name: string,
): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const piece of header.split(";")) {
    const trimmed = piece.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

export function intercomOAuthStartUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL("https://app.intercom.com/oauth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export function intercomWebhookToChats(body: unknown): IngestConversationInput[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? record.data : body;
  try {
    return parseIntercomJson(JSON.stringify(data));
  } catch {
    try {
      return parseIntercomJson(JSON.stringify({ conversations: [data] }));
    } catch {
      return [];
    }
  }
}

export async function pollIntercomConversations(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IngestConversationInput[]> {
  const response = await fetchImpl(INTERCOM_CONVERSATIONS_URL, {
    method: "GET",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Intercom-Version": "2.11",
    },
  });
  if (!response.ok) {
    throw new Error(`intercom_poll_${response.status}`);
  }
  const body = await readWebhookJson(response);
  return intercomWebhookToChats(body);
}
