import { createHash } from "node:crypto";
import { publishIngestion } from "./backend-client";
import { detectionPayload } from "./sync-detection-run";
import { toConversationSyncPayload } from "./sync-conversations";
import type { LlmPassStats } from "./detect-llm";
import type { Conversation, Message, Signal } from "./types";

/** No cache or separate backend writes happen before durable publication succeeds. */
export async function publishAtomicIngest(input: {
  tenantId: string; source: string; replace: boolean; appendOnly?: boolean;
  conversations: Conversation[]; messages: Message[]; signals: Signal[];
  contexts?: LlmPassStats["contexts"];
  classificationFailed?: boolean; skippedIds?: string[];
  onDetectionRunId?: (runId: string) => void;
}) {
  if (input.classificationFailed || input.skippedIds?.length) {
    throw new Error("Every conversation must finish classification before this upload can publish.");
  }
  const files = new Map<string, string[]>();
  for (const chat of input.conversations) {
    const source = chat.sourceFile || input.source;
    files.set(source, [...(files.get(source) ?? []), chat.id]);
  }
  const payload = {
    files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([source, ids]) => ({ source, conversation_ids: ids.sort() })),
    source: input.source, replace: input.replace,
    ...(input.appendOnly ? { append_only: true } : {}),
    conversations: toConversationSyncPayload(input.conversations, input.messages,
      { clearUnlabeledGroundTruth: input.replace }).sort((a, b) => a.conversation_id < b.conversation_id ? -1 : 1),
    detections: detectionPayload(input),
  };
  const uploadId = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  input.onDetectionRunId?.(uploadId);
  const result = await publishIngestion(input.tenantId, uploadId, payload);
  if (result.status !== "completed" || !result.active || result.predictions.some((row) => !row.active)) {
    throw new Error("This upload is incomplete or superseded; refresh before importing again.");
  }
  const ids = new Map(result.predictions.map((row) => [`${row.conversation_id}:${row.signal_type}`, row.id]));
  const signals = input.signals.map((signal): Signal => {
    const id = ids.get(`${signal.conversationId}:${signal.type}`);
    if (!id) throw new Error("Published upload is missing a prediction ID.");
    const unchanged = signal.backendSignalId === id;
    return { ...signal, backendSignalId: id, status: unchanged ? signal.status : "new",
      feedback: unchanged ? signal.feedback : undefined, outcome: unchanged ? signal.outcome : undefined,
      commercialValueEvidence: unchanged ? signal.commercialValueEvidence : undefined };
  });
  return { uploadId, signals };
}
