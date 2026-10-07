import { createHash } from "node:crypto";
import { publishDetectionRun } from "./backend-client";
import type { Conversation, Message, Signal } from "./types";
import type { LlmPassStats } from "./detect-llm";
import type { PredictionSyncResult } from "./sync-predictions";

export function transcriptContentHash(messages: Message[]): string {
  const corpus = [...messages].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((message) => [message.id, message.role, message.content]);
  return createHash("sha256").update(JSON.stringify(corpus)).digest("hex");
}

export function detectionPayload(input: {
  conversations: Conversation[]; messages: Message[]; signals: Signal[]; skippedIds?: string[];
  contexts?: LlmPassStats["contexts"];
}) {
  const skipped = new Set(input.skippedIds ?? []);
  const conversations = input.conversations.filter((chat) => !skipped.has(chat.id)).map((chat) => {
    const signals: Signal[] = input.signals.filter((signal) => signal.conversationId === chat.id);
    const context = input.contexts?.[chat.id] ?? signals.find((signal) => signal.detectionContext)?.detectionContext;
    return { conversation_id: chat.id,
      content_hash: transcriptContentHash(input.messages.filter((message) => message.conversationId === chat.id)),
      model_version: context?.model ?? "heuristic-v1",
      prompt_version: context?.promptVersion ?? "taxonomy-v1",
      ...(context && "includedTurns" in context && "omittedTurns" in context && "truncated" in context &&
        "tokenUpperBound" in context && "tokenBudget" in context ? { coverage: {
          included_turns: context.includedTurns!, omitted_turns: context.omittedTurns!,
          truncated: context.truncated!, token_upper_bound: context.tokenUpperBound!, token_budget: context.tokenBudget!,
        } } : {}),
      output: signals.map((signal) => ({ signal_type: signal.type, confidence: signal.confidence,
        summary: signal.summary, evidence: signal.evidence,
        ...(signal.urgency ? { urgency: signal.urgency } : {}),
        ...(signal.urgencyTimeframe ? { urgency_timeframe: signal.urgencyTimeframe } : {}),
        ...(signal.mentionedValueInr != null ? { mentioned_value_inr: signal.mentionedValueInr } : {}),
      })),
    };
  }).sort((a, b) => a.conversation_id < b.conversation_id ? -1 : 1);
  return conversations;
}

/** Publish complete outputs including none; never carry review state to a new revision. */
export async function syncDetectionRun(input: {
  tenantId: string; conversations: Conversation[]; messages: Message[]; signals: Signal[];
  skippedIds?: string[];
  contexts?: LlmPassStats["contexts"];
  priorSignals?: Signal[];
  onDetectionRunId?: (runId: string) => void;
}): Promise<PredictionSyncResult> {
  const skipped = new Set(input.skippedIds ?? []);
  const conversations = detectionPayload(input);
  if (!conversations.length) return { signals: (input.priorSignals ?? []).filter((signal) => skipped.has(signal.conversationId)), sync: { attempted: 0, created: 0, updated: 0, failed: 0, skipped: skipped.size } };
  const runId = createHash("sha256").update(JSON.stringify(conversations)).digest("hex");
  input.onDetectionRunId?.(runId);
  const result = await publishDetectionRun(input.tenantId, runId, conversations);
  if (result.predictions.some((row) => !row.active)) throw new Error("This detection result was superseded. Run detection again.");
  const ids = new Map(result.predictions.map((row) => [`${row.conversation_id}:${row.signal_type}`, row.id]));
  const signals: Signal[] = input.signals.filter((signal) => !skipped.has(signal.conversationId)).map((signal) => {
    const id = ids.get(`${signal.conversationId}:${signal.type}`);
    if (!id) throw new Error("Published detection response is missing a prediction ID.");
    const unchanged = signal.backendSignalId === id;
    return { ...signal, backendSignalId: id, status: unchanged ? signal.status : "new" as const,
      feedback: unchanged ? signal.feedback : undefined, outcome: unchanged ? signal.outcome : undefined,
      commercialValueEvidence: unchanged ? signal.commercialValueEvidence : undefined };
  });
  signals.push(...(input.priorSignals ?? []).filter((signal) => skipped.has(signal.conversationId)));
  return { signals, sync: { attempted: result.predictions.length, created: result.predictions.length,
    updated: 0, failed: 0, skipped: skipped.size } };
}
