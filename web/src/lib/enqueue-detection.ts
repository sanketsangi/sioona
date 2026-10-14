import { createHash, randomUUID } from "node:crypto";
import { enqueueUploadJob, enqueueDetectJob } from "./backend-client";
import { toConversationSyncPayload } from "./sync-conversations";
import type { Conversation, Message } from "./types";
export async function enqueueCanonicalUpload(input: {
  tenantId: string; source: string; replace: boolean; appendOnly?: boolean;
  conversations: Conversation[]; messages: Message[]; weeklySources?: string[];
}) {
  const weekly = new Set(input.weeklySources ?? []);
  const files = new Map<string, string[]>();
  for (const chat of input.conversations) {
    const source = chat.sourceFile || input.source;
    files.set(source, [...(files.get(source) ?? []), chat.id]);
  }
  const payload = {
    source: input.source, replace: input.replace,
    ...(input.appendOnly ? { append_only: true } : {}),
    record_upload_metadata: !input.appendOnly,
    conversations: toConversationSyncPayload(input.conversations, input.messages,
      { clearUnlabeledGroundTruth: input.replace }).sort((a,b) => a.conversation_id.localeCompare(b.conversation_id)),
    files: [...files].sort(([a],[b]) => a.localeCompare(b)).map(([source,ids]) => ({
      source, conversation_ids: ids.sort(), ...(weekly.has(source) ? { counts_as_weekly: true } : {}),
    })),
  };
  const uploadId = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return enqueueUploadJob(input.tenantId, uploadId, payload);
}
export function enqueueCanonicalDetect(tenantId: string, conversations: Conversation[], requestId = randomUUID()) {
  return enqueueDetectJob(tenantId, requestId, conversations.map(c => c.id));
}
