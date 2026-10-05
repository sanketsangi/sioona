import { getUploadSnapshot } from "./backend-client";
import { predictionToStubSignal } from "./join-needs-review";
import type { Conversation, Message, Signal, StoreData } from "./types";

/** Historical reports never borrow mutable transcripts or newer prediction IDs. */
export async function selectUploadCorpus(store: StoreData, uploadId: string): Promise<StoreData> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(uploadId)) throw new Error("Invalid upload ID");
  const snapshot = await getUploadSnapshot(store.tenant.id, uploadId);
  const invalid = () => { throw new Error("Invalid upload snapshot"); };
  if (snapshot.upload?.tenant_id !== store.tenant.id || snapshot.upload?.upload_id !== uploadId ||
      snapshot.upload?.status !== "completed" || !snapshot.run_id ||
      !Array.isArray(snapshot.conversations) || !Array.isArray(snapshot.detections) ||
      !Array.isArray(snapshot.predictions) || snapshot.conversations.length > 1000 ||
      snapshot.detections.length !== snapshot.conversations.length || snapshot.predictions.length > 3000) invalid();
  const messages: Message[] = [];
  const conversations: Conversation[] = [];
  const ids = new Set<string>();
  for (const chat of snapshot.conversations) {
    if (!chat.conversation_id || ids.has(chat.conversation_id) || !Array.isArray(chat.messages) ||
        typeof chat.channel !== "string" || !Number.isFinite(Date.parse(chat.started_at))) invalid();
    ids.add(chat.conversation_id);
    const messageIds = new Set<string>();
    for (const message of chat.messages) {
      if (!message.message_id || messageIds.has(message.message_id) || typeof message.content !== "string" ||
          !["customer", "agent", "system"].includes(message.role) || !Number.isFinite(Date.parse(message.timestamp))) invalid();
      messageIds.add(message.message_id);
      messages.push({ id: message.message_id, conversationId: chat.conversation_id,
        role: message.role, content: message.content, timestamp: message.timestamp });
    }
    conversations.push({ id: chat.conversation_id, tenantId: store.tenant.id, channel: chat.channel,
      startedAt: chat.started_at, customerName: chat.customer_name ?? undefined,
      groundTruth: chat.ground_truth ?? undefined, sourceFile: snapshot.upload.source,
      messageIds: [...messageIds] });
  }
  const outputs = new Map<string, { evidence: string[] }>();
  const detected = new Set<string>();
  for (const item of snapshot.detections) {
    if (!ids.has(item.conversation_id) || detected.has(item.conversation_id) || !Array.isArray(item.output) || item.output.length > 3) invalid();
    detected.add(item.conversation_id);
    for (const output of item.output) {
      const key = `${item.conversation_id}:${output.signal_type}`;
      if (outputs.has(key) || !Array.isArray(output.evidence) || output.evidence.some((entry) => typeof entry !== "string")) invalid();
      outputs.set(key, output);
    }
  }
  const signals: Signal[] = [];
  const predictionIds = new Set<string>();
  for (const prediction of snapshot.predictions) {
    const key = `${prediction.conversation_id}:${prediction.signal_type}`;
    const output = outputs.get(key);
    if (!output || prediction.tenant_id !== store.tenant.id || !prediction.id || predictionIds.has(prediction.id)) invalid();
    const signal = predictionToStubSignal(prediction);
    if (!signal) invalid();
    predictionIds.add(prediction.id);
    outputs.delete(key);
    signals.push({ ...signal!, evidence: output!.evidence, historical: prediction.active !== true,
      status: prediction.feedback ? "reviewed" : "new",
      feedback: prediction.feedback ? { label: prediction.feedback.feedback,
        note: prediction.feedback.note ?? undefined, reviewedAt: prediction.feedback.reviewed_at } : undefined });
  }
  if (outputs.size) invalid();
  return { ...store, conversations, messages, signals };
}
