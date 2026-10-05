import { createHash } from "node:crypto";
import { publishUpload } from "./backend-client";
import type { Conversation, Message } from "./types";

/** Content-addressed identity from the already-redacted persisted corpus. */
export async function publishIngestUpload(input: {
  tenantId: string; conversations: Conversation[]; messages: Message[];
  source: string; replace: boolean;
}) {
  const corpus = input.conversations.map((chat) => ({
    id: chat.id,
    messages: input.messages.filter((message) => message.conversationId === chat.id)
      .map(({ role, content, timestamp }) => ({ role, content, timestamp })),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const digest = createHash("sha256").update(JSON.stringify({ source: input.source, corpus })).digest("hex");
  return publishUpload(input.tenantId, digest, {
    source: input.source, content_sha256: digest,
    conversation_ids: corpus.map((chat) => chat.id), replace: input.replace,
  });
}
