import { existsSync, readFileSync } from "fs";
import path from "path";
import { runDetection } from "./detect";
import { computeEvalMetrics, type EvalMetrics } from "./eval";
import { customerNameFromExternalId } from "./format";
import { toStoreRecords, type IngestConversationInput } from "./ingest";
import { mapTestingLabelsToGroundTruth } from "./label-ground-truth";
import type { SignalType, StoreData } from "./types";

export { customerNameFromExternalId } from "./format";
export {
  mapTestingLabelsToGroundTruth,
  SOURCE_TO_GT,
} from "./label-ground-truth";

const TENANT_ID = "tenant_demo";
const TESTING_JSON_FILENAME = "testing.json";
const ZERODHA_BATCH02_FILENAME = "zerodha_batch_02.json";

/** Cold-open / Reset Demo chrome name for Groww testing.json. */
export const GROWW_SHOWCASE_SAMPLE_NAME = "Groww_batch_02";
/** Partner Demo chrome name — re-export from client-safe guard (avoid fs on client). */
export { ZERODHA_BATCH02_SAMPLE_NAME } from "./partner-demo-replace-guard";

export const EXPECTED_TESTING_JSON = {
  conversations: 100,
  lead: 16,
  retention: 28,
  upsell: 12,
  none: 44,
} as const;

export const EXPECTED_ZERODHA_BATCH02 = {
  conversations: 100,
} as const;

/** First conversation in Groww testing.json — used to prove packs do not mix. */
export const GROWW_TESTING_JSON_EXTERNAL_ID = "eeshan_kulkarni_41";
/** First conversation in committed Zerodha Batch-02 JSON. */
export const ZERODHA_BATCH02_EXTERNAL_ID = "zrdh_eeshan_kulkarni_41";

export type ConfusionKind = "false_positive" | "false_negative";

export interface ConfusionExample {
  kind: ConfusionKind;
  externalId: string;
  expected: SignalType | "none";
  predicted: SignalType[];
  snippet: string;
  /** Lower = higher severity for reporting sort. */
  severity: number;
}

export interface TestingJsonEvalResult {
  absolutePath: string;
  store: StoreData;
  metrics: EvalMetrics;
  confusion: ConfusionExample[];
}

interface RawLabel {
  signal?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

interface RawConversation {
  externalId?: unknown;
  customerName?: unknown;
  messages?: unknown;
  labels?: unknown;
}

/**
 * Resolve testing.json for Node/Vitest and Next (cwd usually `web/`).
 * Prefer deployable copy under `web/data/samples/` (Vercel cannot rely on
 * repo-root), then fall back to repo-root canonical file.
 */
export function resolveTestingJsonPath(repoRoot?: string): string {
  const cwd = process.cwd();
  const samplesCopy = path.join(cwd, "data", "samples", TESTING_JSON_FILENAME);
  if (existsSync(samplesCopy)) return samplesCopy;

  if (repoRoot) {
    return path.join(repoRoot, TESTING_JSON_FILENAME);
  }

  const fromWebCwd = path.join(cwd, "..", TESTING_JSON_FILENAME);
  if (existsSync(fromWebCwd)) return fromWebCwd;

  const fromRepoCwd = path.join(cwd, TESTING_JSON_FILENAME);
  if (existsSync(fromRepoCwd)) return fromRepoCwd;

  // Default expectation when none exist yet (clearer error from caller).
  return samplesCopy;
}

/**
 * Resolve committed Zerodha Batch-02 JSON for Partner Demo (Vercel samples copy).
 */
export function resolveZerodhaBatch02Path(repoRoot?: string): string {
  const cwd = process.cwd();
  const samplesCopy = path.join(
    cwd,
    "data",
    "samples",
    ZERODHA_BATCH02_FILENAME
  );
  if (existsSync(samplesCopy)) return samplesCopy;

  if (repoRoot) {
    return path.join(repoRoot, "web", "data", "samples", ZERODHA_BATCH02_FILENAME);
  }

  const fromRepoCwd = path.join(
    cwd,
    "web",
    "data",
    "samples",
    ZERODHA_BATCH02_FILENAME
  );
  if (existsSync(fromRepoCwd)) return fromRepoCwd;

  return samplesCopy;
}

function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeRole(value: unknown): "customer" | "agent" | "system" {
  const raw = asTrimmedString(value).toLowerCase();
  if (
    raw === "agent" ||
    raw === "admin" ||
    raw === "support" ||
    raw === "bot" ||
    raw === "assistant"
  ) {
    return "agent";
  }
  if (raw === "system") return "system";
  return "customer";
}

function parseTestingConversation(
  raw: RawConversation
): IngestConversationInput | null {
  const messagesRaw = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = messagesRaw
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const msg = m as Record<string, unknown>;
      const content = asTrimmedString(msg.content ?? msg.text ?? msg.body);
      if (!content) return null;
      return {
        role: normalizeRole(msg.role ?? msg.sender ?? msg.author),
        content,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (messages.length === 0) return null;

  const labels = Array.isArray(raw.labels)
    ? (raw.labels as RawLabel[])
    : undefined;

  const externalId = asTrimmedString(raw.externalId) || undefined;
  const explicitName = asTrimmedString(raw.customerName);
  const customerName =
    explicitName || customerNameFromExternalId(externalId) || undefined;

  return {
    externalId,
    customerName,
    groundTruth: mapTestingLabelsToGroundTruth(labels),
    messages,
  };
}

export function parseTestingJsonDocument(
  text: string
): IngestConversationInput[] {
  const parsed = JSON.parse(text) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { conversations?: unknown }).conversations)
  ) {
    throw new Error("testing.json must be { conversations: [...] }");
  }

  const conversations = (
    parsed as { conversations: RawConversation[] }
  ).conversations
    .map(parseTestingConversation)
    .filter((c): c is IngestConversationInput => c !== null);

  if (conversations.length === 0) {
    throw new Error("testing.json contained no usable conversations");
  }

  return conversations;
}

function firstCustomerSnippet(
  store: StoreData,
  conversationId: string
): string {
  const conversation = store.conversations.find((c) => c.id === conversationId);
  if (!conversation) return "";
  for (const messageId of conversation.messageIds) {
    const message = store.messages.find((m) => m.id === messageId);
    if (message?.role === "customer" && message.content) {
      const text = message.content.replace(/\s+/g, " ").trim();
      return text.length > 140 ? `${text.slice(0, 137)}…` : text;
    }
  }
  return "";
}

function signalSnippet(
  store: StoreData,
  conversationId: string
): string {
  const signals = store.signals.filter((s) => s.conversationId === conversationId);
  for (const signal of signals) {
    const evidence = signal.evidence?.[0];
    if (evidence) {
      const text = evidence.replace(/\s+/g, " ").trim();
      return text.length > 140 ? `${text.slice(0, 137)}…` : text;
    }
  }
  return firstCustomerSnippet(store, conversationId);
}

/**
 * Conversation-level FP/FN examples for reporting.
 * Severity: wrong-type FP (0) < none-as-signal FP (1) < FN miss (2).
 */
export function listConfusionExamples(store: StoreData): ConfusionExample[] {
  const examples: ConfusionExample[] = [];
  const labeled = store.conversations.filter((c) => c.groundTruth);

  for (const conversation of labeled) {
    const expected = conversation.groundTruth!;
    const preds = store.signals.filter(
      (s) => s.conversationId === conversation.id
    );
    const predicted = preds.map((s) => s.type);
    const externalId = conversation.externalId ?? conversation.id;
    const snippet = signalSnippet(store, conversation.id);

    if (expected === "none") {
      if (preds.length > 0) {
        examples.push({
          kind: "false_positive",
          externalId,
          expected,
          predicted,
          snippet,
          severity: 1,
        });
      }
      continue;
    }

    const hits = preds.filter((s) => s.type === expected);
    const misses = preds.filter((s) => s.type !== expected);

    if (hits.length === 0) {
      examples.push({
        kind: "false_negative",
        externalId,
        expected,
        predicted,
        snippet: firstCustomerSnippet(store, conversation.id),
        severity: 2,
      });
    }

    if (misses.length > 0) {
      examples.push({
        kind: "false_positive",
        externalId,
        expected,
        predicted,
        snippet,
        severity: 0,
      });
    }
  }

  return examples.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity - b.severity;
    return a.externalId.localeCompare(b.externalId);
  });
}

/** Load testing.json → map labels → ingest → detect → metrics + confusion. */
export function loadTestingJsonEval(options?: {
  repoRoot?: string;
  absolutePath?: string;
  tenantId?: string;
}): TestingJsonEvalResult {
  const tenantId = options?.tenantId ?? TENANT_ID;
  const absolutePath =
    options?.absolutePath ?? resolveTestingJsonPath(options?.repoRoot);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing ${TESTING_JSON_FILENAME} at ${absolutePath}. Expected at repo root.`
    );
  }

  const content = readFileSync(absolutePath, "utf8");
  const inputs = parseTestingJsonDocument(content);
  const { conversations, messages } = toStoreRecords(inputs, tenantId);
  const signals = runDetection(conversations, messages, tenantId);

  const store: StoreData = {
    tenant: {
      id: tenantId,
      name: "testing.json synthetic eval",
      createdAt: "2026-08-11T00:00:00.000Z",
    },
    conversations,
    messages,
    signals,
    pilot: { baselineOpportunities: 0 },
  };

  return {
    absolutePath,
    store,
    metrics: computeEvalMetrics(store),
    confusion: listConfusionExamples(store),
  };
}

export function formatTestingJsonMetrics(metrics: EvalMetrics): string {
  const pct = (value: number | null) =>
    value === null ? "n/a" : value.toFixed(2);
  const lines = [
    `labeled=${metrics.labeledConversations} P=${pct(metrics.labeledPrecision)} R=${pct(metrics.labeledRecall)} TP=${metrics.truePositives} FP=${metrics.falsePositives} FN=${metrics.falseNegatives}`,
    ...metrics.byType.map(
      (row) =>
        `${row.type}: labeled=${row.labeledCount} P=${pct(row.precision)} R=${pct(row.recall)} TP=${row.truePositives} FP=${row.falsePositives} FN=${row.falseNegatives}`
    ),
  ];
  return lines.join("\n");
}

export function formatConfusionExamples(
  examples: ConfusionExample[],
  limit = 10
): string {
  if (examples.length === 0) return "(no FP/FN)";
  return examples
    .slice(0, limit)
    .map(
      (ex, i) =>
        `${i + 1}. [${ex.kind}] ${ex.externalId} expected=${ex.expected} predicted=[${ex.predicted.join(",") || "—"}] — ${ex.snippet || "(no snippet)"}`
    )
    .join("\n");
}
