/**
 * Intercom read-only connector: OAuth start URL, webhook body, and a GET poll.
 * The access token stays in the environment. This module never posts a reply.
 */

import { parseIntercomJson } from "../ingest-platforms";
import type { IngestConversationInput } from "../ingest-platforms";

const INTERCOM_CONVERSATIONS_URL =
  "https://api.intercom.io/conversations?per_page=20";

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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Intercom-Version": "2.11",
    },
  });
  if (!response.ok) {
    throw new Error(`intercom_poll_${response.status}`);
  }
  const body = (await response.json()) as unknown;
  return intercomWebhookToChats(body);
}
