import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { sampleStore } from "@/data/fixtures/sample-store";
import type {
  AuditEvent,
  FeedbackLabel,
  PilotSettings,
  Signal,
  SignalType,
  StoreData,
  TaxonomyOverrides,
  TaxonomyTypeOverride,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export function normalizeStore(data: StoreData): StoreData {
  return {
    ...data,
    pilot: data.pilot ?? { baselineOpportunities: 0 },
    taxonomyOverrides: data.taxonomyOverrides ?? {},
    auditEvents: data.auditEvents ?? [],
  };
}

/** Append-only audit trail helper (mutates the passed store in place). */
export function appendAuditEvent(
  store: StoreData,
  event: Omit<AuditEvent, "id" | "timestamp"> &
    Partial<Pick<AuditEvent, "id" | "timestamp">>
): AuditEvent {
  const entry: AuditEvent = {
    id: event.id ?? `audit_${randomUUID().slice(0, 8)}`,
    timestamp: event.timestamp ?? new Date().toISOString(),
    action: event.action,
    signalId: event.signalId,
    conversationId: event.conversationId,
    signalType: event.signalType,
    label: event.label,
  };
  store.auditEvents = [...(store.auditEvents ?? []), entry];
  return entry;
}

export async function readStore(): Promise<StoreData> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw) as StoreData);
  } catch {
    const seeded = normalizeStore(structuredClone(sampleStore));
    await writeStore(seeded);
    return seeded;
  }
}

export async function writeStore(data: StoreData): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    STORE_PATH,
    JSON.stringify(normalizeStore(data), null, 2),
    "utf8"
  );
}

export async function resetStore(): Promise<StoreData> {
  const seeded = normalizeStore(structuredClone(sampleStore));
  await writeStore(seeded);
  return seeded;
}

/** Match key for carrying review state across re-detect runs. */
function signalKey(signal: Pick<Signal, "conversationId" | "type">): string {
  return `${signal.conversationId}:${signal.type}`;
}

/**
 * Replace detected signals while keeping SignalScore feedback when the same
 * conversation + type is still emitted.
 */
export function mergeSignalsPreservingFeedback(
  previous: Signal[],
  next: Signal[]
): Signal[] {
  const priorByKey = new Map(previous.map((s) => [signalKey(s), s]));
  return next.map((signal) => {
    const prior = priorByKey.get(signalKey(signal));
    if (!prior?.feedback) return signal;
    return {
      ...signal,
      id: prior.id,
      createdAt: prior.createdAt,
      feedback: prior.feedback,
      status: prior.status === "acted" ? "acted" : "reviewed",
    };
  });
}

export async function replaceSignalsPreservingFeedback(
  signals: Signal[]
): Promise<StoreData> {
  const store = await readStore();
  store.signals = mergeSignalsPreservingFeedback(store.signals, signals);
  await writeStore(store);
  return store;
}

export async function upsertSignals(signals: Signal[]): Promise<StoreData> {
  const store = await readStore();
  const byConversation = new Set(signals.map((s) => s.conversationId));
  const kept = store.signals.filter((s) => !byConversation.has(s.conversationId));
  const merged = mergeSignalsPreservingFeedback(store.signals, signals);
  store.signals = [...kept, ...merged];
  await writeStore(store);
  return store;
}

export async function setSignalFeedback(
  signalId: string,
  label: FeedbackLabel,
  note?: string
): Promise<Signal | null> {
  const store = await readStore();
  const signal = store.signals.find((s) => s.id === signalId);
  if (!signal) return null;
  signal.feedback = {
    label,
    note,
    reviewedAt: new Date().toISOString(),
  };
  signal.status = "reviewed";
  appendAuditEvent(store, {
    action: "signal_feedback",
    signalId: signal.id,
    conversationId: signal.conversationId,
    signalType: signal.type,
    label,
  });
  await writeStore(store);
  return signal;
}

export async function setPilotBaseline(
  baselineOpportunities: number,
  baselineNote?: string
): Promise<StoreData> {
  const store = await readStore();
  const pilot: PilotSettings = {
    baselineOpportunities: Math.max(0, Math.floor(baselineOpportunities)),
    updatedAt: new Date().toISOString(),
  };
  if (baselineNote?.trim()) {
    pilot.baselineNote = baselineNote.trim();
  }
  store.pilot = pilot;
  await writeStore(store);
  return store;
}

export type TaxonomyOverrideField =
  | "phrases"
  | "keywords"
  | "negativePhrases";

export async function addTaxonomyOverride(
  type: SignalType,
  field: TaxonomyOverrideField,
  value: string
): Promise<StoreData> {
  const term = value.trim();
  if (!term) {
    throw new Error("Override value is required");
  }

  const store = await readStore();
  const overrides: TaxonomyOverrides = {
    ...(store.taxonomyOverrides ?? {}),
  };
  const current: TaxonomyTypeOverride = { ...(overrides[type] ?? {}) };
  const list = [...(current[field] ?? [])];
  const exists = list.some((item) => item.toLowerCase() === term.toLowerCase());
  if (!exists) {
    list.push(term);
  }
  current[field] = list;
  overrides[type] = current;
  store.taxonomyOverrides = overrides;
  await writeStore(store);
  return store;
}

export async function setConversationGroundTruth(
  conversationId: string,
  groundTruth: SignalType | "none" | null
): Promise<StoreData | null> {
  const store = await readStore();
  const conversation = store.conversations.find((c) => c.id === conversationId);
  if (!conversation) return null;

  if (groundTruth === null) {
    delete conversation.groundTruth;
  } else {
    conversation.groundTruth = groundTruth;
  }

  for (const signal of store.signals) {
    if (signal.conversationId === conversationId) {
      if (groundTruth === null) {
        delete signal.groundTruth;
      } else {
        signal.groundTruth = groundTruth;
      }
    }
  }

  await writeStore(store);
  return store;
}
