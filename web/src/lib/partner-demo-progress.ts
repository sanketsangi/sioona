/**
 * Partner Demo pipeline events. Server emits real wipe / detect ticks as NDJSON.
 * Neon chat/prediction dual-write runs after complete (`after()`), like ingest.
 */

import type { LlmPassStats } from "./detect-llm";
import { parseLlmPassStats } from "./detect-llm-query";
import {
  parsePredictionSync,
  type PredictionSyncStats,
} from "./prediction-sync";
import type { ConversationSyncStats } from "./sync-conversations";

export const PARTNER_DEMO_NDJSON_CONTENT_TYPE =
  "application/x-ndjson; charset=utf-8";

export type PartnerDemoStep = "wipe" | "detect" | "sync_chats" | "sync_signals";

export type PartnerDemoProgress = {
  step: PartnerDemoStep;
  done: number;
  total: number;
};

export type PartnerDemoProgressEvent = PartnerDemoProgress & {
  type: "progress";
};

export type PartnerDemoCompleteEvent = {
  type: "complete";
  importedConversations: number;
  newSignals: number;
  samples: string[];
  predictionSync: PredictionSyncStats;
  conversationSync: ConversationSyncStats;
  detectLlm: LlmPassStats;
  wipeFailed?: true;
  wipeError?: string;
};

export type PartnerDemoErrorEvent = {
  type: "error";
  error: string;
};

export type PartnerDemoStreamEvent =
  | PartnerDemoProgressEvent
  | PartnerDemoCompleteEvent
  | PartnerDemoErrorEvent;

const STEPS: PartnerDemoStep[] = [
  "wipe",
  "detect",
  "sync_chats",
  "sync_signals",
];

function isPartnerDemoStep(value: unknown): value is PartnerDemoStep {
  return typeof value === "string" && STEPS.includes(value as PartnerDemoStep);
}

function nonNegInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseConversationSync(raw: unknown): ConversationSyncStats | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const attempted = nonNegInt(o.attempted);
  const created = nonNegInt(o.created);
  const updated = nonNegInt(o.updated);
  const failed = nonNegInt(o.failed);
  const skipped = nonNegInt(o.skipped);
  const messagesCreated = nonNegInt(o.messagesCreated);
  const messagesUpdated = nonNegInt(o.messagesUpdated);
  if (
    attempted == null ||
    created == null ||
    updated == null ||
    failed == null ||
    skipped == null ||
    messagesCreated == null ||
    messagesUpdated == null
  ) {
    return null;
  }
  return {
    attempted,
    created,
    updated,
    failed,
    skipped,
    messagesCreated,
    messagesUpdated,
  };
}

export function parsePartnerDemoStreamEvent(
  raw: unknown,
): PartnerDemoStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "progress") {
    const done = nonNegInt(o.done);
    const total = nonNegInt(o.total);
    if (!isPartnerDemoStep(o.step) || done == null || total == null)
      return null;
    return { type: "progress", step: o.step, done, total };
  }
  if (o.type === "error") {
    if (typeof o.error !== "string" || !o.error.trim()) return null;
    return { type: "error", error: o.error };
  }
  if (o.type !== "complete") return null;

  const importedConversations = nonNegInt(o.importedConversations);
  const newSignals = nonNegInt(o.newSignals);
  const predictionSync = parsePredictionSync(o.predictionSync);
  const conversationSync = parseConversationSync(o.conversationSync);
  const detectLlm = parseLlmPassStats(o.detectLlm);
  if (
    importedConversations == null ||
    newSignals == null ||
    !predictionSync ||
    !conversationSync ||
    !detectLlm ||
    !Array.isArray(o.samples) ||
    o.samples.some((row) => typeof row !== "string")
  ) {
    return null;
  }

  const event: PartnerDemoCompleteEvent = {
    type: "complete",
    importedConversations,
    newSignals,
    samples: o.samples as string[],
    predictionSync,
    conversationSync,
    detectLlm,
  };
  if (o.wipeFailed === true) {
    event.wipeFailed = true;
    if (typeof o.wipeError === "string" && o.wipeError.trim()) {
      event.wipeError = o.wipeError;
    }
  }
  return event;
}

export function encodePartnerDemoNdjsonLine(
  event: PartnerDemoStreamEvent,
): string {
  return `${JSON.stringify(event)}\n`;
}

export function partnerDemoStatusLabel(event: PartnerDemoProgress): string {
  switch (event.step) {
    case "wipe":
      return "Uploading…";
    case "detect":
      return "Finding signals…";
    case "sync_chats":
    case "sync_signals":
      return "Extracting…";
  }
}

/**
 * Honest bar for the hot path (wipe → detect). Neon dual-write runs after
 * complete, so sync ticks stay at 100 when they still appear.
 */
export function partnerDemoProgressPercent(
  event: PartnerDemoProgress,
): number {
  const ratio =
    event.total <= 0
      ? 1
      : Math.min(1, Math.max(0, event.done / event.total));
  switch (event.step) {
    case "wipe":
      return Math.round(8 + ratio * 14);
    case "detect":
      return Math.round(22 + ratio * 78);
    case "sync_chats":
    case "sync_signals":
      return 100;
  }
}

/** Same pipeline as Partner Demo; wipe copy matches the Reset button. */
export function resetDemoStatusLabel(event: PartnerDemoProgress): string {
  if (event.step === "wipe") return "Resetting…";
  return partnerDemoStatusLabel(event);
}

/** Collapse consecutive progress ticks into the named pipeline order. */
export function partnerDemoStepSequence(
  events: Array<{ type?: string; step?: PartnerDemoStep }>,
): PartnerDemoStep[] {
  const steps: PartnerDemoStep[] = [];
  for (const event of events) {
    if (event.step == null) continue;
    if (event.type != null && event.type !== "progress") continue;
    if (steps[steps.length - 1] !== event.step) steps.push(event.step);
  }
  return steps;
}

export function isPartnerDemoNdjsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("ndjson") || contentType.includes("event-stream");
}

async function jsonErrorMessage(
  response: Response,
  failedMessage: string,
): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error || failedMessage;
}

export async function readPartnerDemoNdjsonEvents(
  response: Response,
  failedMessage = "Demo failed",
): Promise<PartnerDemoStreamEvent[]> {
  const events: PartnerDemoStreamEvent[] = [];
  for await (const event of iteratePartnerDemoNdjson(response, failedMessage)) {
    events.push(event);
  }
  return events;
}

export async function consumePartnerDemoNdjson(
  response: Response,
  options?: {
    onProgress?: (event: PartnerDemoProgressEvent) => void;
    failedMessage?: string;
  },
): Promise<PartnerDemoCompleteEvent> {
  const failedMessage = options?.failedMessage ?? "Demo failed";
  let complete: PartnerDemoCompleteEvent | undefined;
  for await (const event of iteratePartnerDemoNdjson(response, failedMessage)) {
    if (event.type === "progress") {
      options?.onProgress?.(event);
      continue;
    }
    if (event.type === "error") {
      throw new Error(event.error);
    }
    complete = event;
  }
  if (!complete) throw new Error(failedMessage);
  return complete;
}

async function* iteratePartnerDemoNdjson(
  response: Response,
  failedMessage = "Demo failed",
): AsyncGenerator<PartnerDemoStreamEvent> {
  if (!response.body) {
    throw new Error(
      response.ok
        ? failedMessage
        : await jsonErrorMessage(response, failedMessage),
    );
  }

  if (!response.ok && !isPartnerDemoNdjsonResponse(response)) {
    throw new Error(await jsonErrorMessage(response, failedMessage));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line: string): PartnerDemoStreamEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new Error(failedMessage);
    }
    const event = parsePartnerDemoStreamEvent(raw);
    if (!event) throw new Error(failedMessage);
    return event;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseLine(line);
      if (event) yield event;
    }
  }
  buffer += decoder.decode();
  const last = parseLine(buffer);
  if (last) yield last;
}
