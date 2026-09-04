import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import {
  patchConversationGroundTruth,
  upsertConversation,
} from "./backend-client";
import { toConversationSyncPayload } from "./sync-conversations";
import { syncPilotSettingsToBackend } from "./sync-pilot";
import {
  applySupervisedActionDecision,
  ensureSupervisedActions,
} from "./supervised-actions";
import type {
  AuditEvent,
  Conversation,
  FeedbackLabel,
  PilotSettings,
  Signal,
  SignalType,
  StoreData,
  SupervisedAction,
  SupervisedActionDecision,
  TaxonomyOverrides,
  TaxonomyTypeOverride,
} from "./types";
import {
  wipeTenantDataFailSoft,
  type TenantWipeStats,
} from "./wipe-tenant";

export type ReadStoreOptions = {
  /**
   * Await `POST /v1/predictions` on cold-start hydrate/seed.
   * Default true (API / reset). Homepage GET / passes false and defers
   * Insights/Eval dual-write with `after()` so TTFB is not blocked.
   */
  syncPredictions?: boolean;
};

export type ReadStoreLoad = {
  store: StoreData;
  /** True when this read hydrated from Neon or seeded testing.json. */
  coldStart: boolean;
};

/** In-process cache of the last parsed store.json (mtime+size keyed). */
type StoreFileCache = {
  path: string;
  mtimeMs: number;
  size: number;
  store: StoreData;
};

let storeFileCache: StoreFileCache | null = null;

function cloneStore(store: StoreData): StoreData {
  return normalizeStore(structuredClone(store));
}

function cacheStoreSnapshot(
  storePath: string,
  stat: { mtimeMs: number; size: number },
  store: StoreData
): void {
  storeFileCache = {
    path: storePath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    // Own snapshot — callers get a separate clone via cloneStore().
    store,
  };
}

/** Seed showcase from testing.json (dynamic import avoids cycle with writeStore). */
async function seedShowcaseStore(
  options?: Pick<ReadStoreOptions, "syncPredictions">
): Promise<StoreData> {
  const { loadTestingJsonIntoStore } = await import("./load-testing-json-store");
  const result = await loadTestingJsonIntoStore({
    applyDemoBaseline: false,
    syncPredictions: options?.syncPredictions !== false,
  });
  return result.store;
}

export type ResetStoreResult = {
  store: StoreData;
  wipe: TenantWipeStats;
};

/**
 * Wipe this tenant's Neon data (fail-soft), then reseed JSON from Groww
 * testing.json. Cold start uses seedShowcaseStore / hydrate — not this path.
 * Partner Demo is a separate wipe + Zerodha Batch-02 load.
 */
export async function resetStoreWithWipe(): Promise<ResetStoreResult> {
  const wipe = await wipeTenantDataFailSoft(emptyShowcaseStore.tenant.id);
  const store = await seedShowcaseStore();
  return { store, wipe };
}

// Local dev writes the bundled data dir; serverless (Vercel) filesystems are
// read-only except for the OS temp dir, so we fall back there when the bundled
// dir can't be written. On serverless the store lives in tmp and is
// per-instance ephemeral. Cold start hydrates conversations from Neon when
// present; otherwise reseeds from testing.json.
const BUNDLED_DATA_DIR = path.join(process.cwd(), "data");
const BUNDLED_STORE_PATH = path.join(BUNDLED_DATA_DIR, "store.json");
const TMP_DATA_DIR = path.join(os.tmpdir(), "sioona-store");
const TMP_STORE_PATH = path.join(TMP_DATA_DIR, "store.json");

/** Per-worker tmp store under Vitest so parallel files never race data/store.json. */
function vitestStoreCandidate(): [string, string] | null {
  if (!process.env.VITEST) return null;
  const worker =
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "0";
  const dir = path.join(os.tmpdir(), `sioona-store-vitest-${worker}`);
  return [dir, path.join(dir, "store.json")];
}

// Resolved once to the first writable store path; `null` means no writable
// filesystem, in which case we keep an in-memory seed so reads never throw.
let resolvedStorePath: string | null | undefined;
let memoryStore: StoreData | null = null;

/** Pick (and cache) the first writable location for the JSON store. */
async function resolveStorePath(): Promise<string | null> {
  if (resolvedStorePath !== undefined) return resolvedStorePath;
  const candidates: Array<[string, string]> = [];
  const vitest = vitestStoreCandidate();
  if (vitest) candidates.push(vitest);
  candidates.push(
    [BUNDLED_DATA_DIR, BUNDLED_STORE_PATH],
    [TMP_DATA_DIR, TMP_STORE_PATH]
  );
  for (const [dir, file] of candidates) {
    try {
      await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
      const probe = path.join(dir, ".write-probe");
      await fs.writeFile(/*turbopackIgnore: true*/ probe, "ok", "utf8");
      await fs.rm(/*turbopackIgnore: true*/ probe, { force: true });
      resolvedStorePath = file;
      return file;
    } catch {
      // Not writable (e.g. EROFS/EACCES on serverless) — try the next one.
    }
  }
  resolvedStorePath = null;
  return null;
}

/** Map legacy JSON feedback labels to canonical SignalScore labels. */
function normalizeFeedbackLabel(label: string): FeedbackLabel {
  if (label === "accept") return "correct";
  if (label === "reject") return "incorrect";
  if (label === "wrong_reason") return "partially_correct";
  return label as FeedbackLabel;
}

export function normalizeStore(data: StoreData): StoreData {
  return {
    ...data,
    pilot: data.pilot ?? { baselineOpportunities: 0 },
    taxonomyOverrides: data.taxonomyOverrides ?? {},
    auditEvents: (data.auditEvents ?? []).map((event) => ({
      ...event,
      label: normalizeFeedbackLabel(event.label),
    })),
    supervisedActions: data.supervisedActions ?? [],
    actionLogs: data.actionLogs ?? [],
    signals: data.signals.map((signal) =>
      signal.feedback
        ? {
            ...signal,
            feedback: {
              ...signal.feedback,
              label: normalizeFeedbackLabel(signal.feedback.label),
            },
          }
        : signal
    ),
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

export async function loadStore(
  options?: ReadStoreOptions
): Promise<ReadStoreLoad> {
  const syncPredictions = options?.syncPredictions !== false;
  const storePath = await resolveStorePath();
  if (storePath) {
    try {
      const stat = await fs.stat(/*turbopackIgnore: true*/ storePath);
      if (
        storeFileCache &&
        storeFileCache.path === storePath &&
        storeFileCache.mtimeMs === stat.mtimeMs &&
        storeFileCache.size === stat.size
      ) {
        return { store: cloneStore(storeFileCache.store), coldStart: false };
      }
      const raw = await fs.readFile(/*turbopackIgnore: true*/ storePath, "utf8");
      const store = normalizeStore(JSON.parse(raw) as StoreData);
      // Cache a private clone; return another so cache ≠ caller mutations.
      cacheStoreSnapshot(storePath, stat, structuredClone(store));
      return { store: cloneStore(store), coldStart: false };
    } catch {
      storeFileCache = null;
      // No persisted file yet — fall through to seed from bundled fixtures.
    }
  } else if (memoryStore) {
    return {
      store: normalizeStore(structuredClone(memoryStore)),
      coldStart: false,
    };
  }
  const { tryHydrateStoreFromNeon } = await import("./hydrate-conversations");
  const hydrated = await tryHydrateStoreFromNeon({ syncPredictions });
  if (hydrated) return { store: hydrated, coldStart: true };
  return {
    store: await seedShowcaseStore({ syncPredictions }),
    coldStart: true,
  };
}

export async function readStore(
  options?: ReadStoreOptions
): Promise<StoreData> {
  const { store } = await loadStore(options);
  return store;
}

export async function writeStore(data: StoreData): Promise<void> {
  const normalized = normalizeStore(data);
  const storePath = await resolveStorePath();
  if (!storePath) {
    // Fully read-only filesystem: keep the store in memory so a GET before any
    // write still returns seeded fixtures without throwing (per-instance only).
    memoryStore = normalized;
    storeFileCache = null;
    return;
  }
  try {
    await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(storePath), {
      recursive: true,
    });
    // Compact JSON — same parse result, less I/O on every feedback/Acted/ingest.
    await fs.writeFile(
      /*turbopackIgnore: true*/ storePath,
      JSON.stringify(normalized),
      "utf8"
    );
    const stat = await fs.stat(/*turbopackIgnore: true*/ storePath);
    // Snapshot for cache — caller may keep mutating `data` after write.
    cacheStoreSnapshot(storePath, stat, structuredClone(normalized));
  } catch {
    // Became unwritable at runtime — degrade to in-memory rather than throwing.
    resolvedStorePath = null;
    memoryStore = normalized;
    storeFileCache = null;
  }
}

export async function resetStore(): Promise<StoreData> {
  const { store } = await resetStoreWithWipe();
  return store;
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
    if (!prior) return signal;

    const withBackendId: Signal = {
      ...signal,
      backendSignalId: prior.backendSignalId ?? signal.backendSignalId,
    };

    if (!prior.feedback) return withBackendId;

    return {
      ...withBackendId,
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
  ensureSupervisedActions(store);
  await writeStore(store);
  return store;
}

/**
 * Generate missing high-confidence retention email drafts and persist.
 * Used on Insights load for signals already in the store (no re-detect).
 */
export async function persistSupervisedActions(
  extraSignals: Signal[] = [],
  extraConversations: Conversation[] = []
): Promise<SupervisedAction[]> {
  const store = await readStore();
  const { created, changed } = ensureSupervisedActions(
    store,
    extraSignals,
    extraConversations
  );
  if (changed) {
    await writeStore(store);
  }
  return created;
}

export type DecideSupervisedActionStoreResult =
  | { ok: true; action: SupervisedAction }
  | {
      ok: false;
      reason: "not_found" | "invalid_body";
    };

export async function decideSupervisedAction(
  actionId: string,
  decision: SupervisedActionDecision,
  edits?: { subject?: string; body?: string }
): Promise<DecideSupervisedActionStoreResult> {
  const store = await readStore();
  const result = applySupervisedActionDecision(
    store,
    actionId,
    decision,
    edits
  );
  if (!result.ok) return result;
  await writeStore(store);
  return result;
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
  if (signal.status !== "acted") {
    signal.status = "reviewed";
  }
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

export type SetSignalActedResult =
  | { ok: true; signal: Signal }
  | { ok: false; reason: "not_found" | "not_reviewed" };

/**
 * Shadow Mode only: persist `status: acted` (or undo to `reviewed`).
 * Requires existing feedback. Does not clear feedback or fire suggestedAction.
 */
export async function setSignalActed(
  signalId: string,
  acted: boolean
): Promise<SetSignalActedResult> {
  const store = await readStore();
  const signal = store.signals.find((s) => s.id === signalId);
  if (!signal) return { ok: false, reason: "not_found" };
  if (!signal.feedback) return { ok: false, reason: "not_reviewed" };
  signal.status = acted ? "acted" : "reviewed";
  await writeStore(store);
  return { ok: true, signal };
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
  if (store.pilot?.weeklyExportCount != null) {
    pilot.weeklyExportCount = store.pilot.weeklyExportCount;
  }
  if (store.pilot?.lastUploadedFileName) {
    pilot.lastUploadedFileName = store.pilot.lastUploadedFileName;
  }
  store.pilot = pilot;
  await writeStore(store);
  await syncPilotSettingsToBackend(store.tenant.id, pilot);
  return store;
}

export type TaxonomyOverrideField =
  | "phrases"
  | "keywords"
  | "negativePhrases";

const SIGNAL_TYPES: SignalType[] = ["lead", "retention", "upsell"];
const OVERRIDE_FIELDS: TaxonomyOverrideField[] = [
  "phrases",
  "keywords",
  "negativePhrases",
];

function uniqOverrideTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

/** Union two override maps (case-insensitive per type × field). */
export function mergeTaxonomyOverrides(
  existing: TaxonomyOverrides | undefined | null,
  incoming: TaxonomyOverrides
): TaxonomyOverrides {
  const out: TaxonomyOverrides = { ...(existing ?? {}) };
  for (const type of SIGNAL_TYPES) {
    const extra = incoming[type];
    if (!extra) continue;
    const merged: TaxonomyTypeOverride = { ...(out[type] ?? {}) };
    for (const field of OVERRIDE_FIELDS) {
      const unique = uniqOverrideTerms([
        ...(merged[field] ?? []),
        ...(extra[field] ?? []),
      ]);
      if (unique.length > 0) {
        merged[field] = unique;
      }
    }
    out[type] = merged;
  }
  return out;
}

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
  store.taxonomyOverrides = mergeTaxonomyOverrides(store.taxonomyOverrides, {
    [type]: { [field]: [term] },
  });
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

  try {
    if (groundTruth === null) {
      await patchConversationGroundTruth(
        conversation.tenantId,
        conversationId,
        null
      );
    } else {
      const messages = store.messages.filter(
        (message) => message.conversationId === conversationId
      );
      const [payload] = toConversationSyncPayload([conversation], messages);
      if (payload) {
        await upsertConversation(conversation.tenantId, payload);
      }
    }
  } catch {
    // JSON is still SoT when the file exists; hydrate restores GT once Neon has it.
  }

  return store;
}
