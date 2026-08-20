import { existsSync, readFileSync } from "fs";
import path from "path";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "../data/fixtures/partner-export-overrides";
import { runDetection } from "./detect";
import {
  isDetectLlmEnabled,
  runHybridDetection,
  type LlmClassifyFn,
  type LlmPassStats,
} from "./detect-llm";
import { computeEvalMetrics, type EvalMetrics } from "./eval";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import {
  formatConfusionExamples,
  listConfusionExamples,
  type ConfusionExample,
} from "./testing-json-eval";
import type { StoreData, TaxonomyOverrides } from "./types";

export { PARTNER_EXPORT_ADAPT_OVERRIDES };

const SAMPLES_DIR = path.join(process.cwd(), "data/samples");
const FIXTURES_DIR = path.join(process.cwd(), "src/data/fixtures");

/** Committed redacted template — eval/CLI only, not the live Upload pack. */
export const PARTNER_EXPORT_TEMPLATE_FILE =
  "real-partner-export.template.csv";

/**
 * Local drop-in for Day-1 / week-1 pilot chats (gitignored).
 * Copy the template, replace rows with redacted partner transcripts + ground_truth.
 */
export const PARTNER_EXPORT_LOCAL_FILE = "real-partner-export.local.csv";

/**
 * Week-2 held-out drop-in (gitignored). Does not overwrite week-1 local.csv.
 * Prefer via preferWeek2 / --week2 / PARTNER_EXPORT=week2.
 */
export const PARTNER_EXPORT_WEEK2_LOCAL_FILE =
  "real-partner-export.week2.local.csv";

const TENANT_ID = "tenant_demo";

export type PartnerExportSource = "local" | "template" | "week2";

export interface PartnerExportEvalResult {
  source: PartnerExportSource;
  filename: string;
  absolutePath: string;
  /** Heuristic signals only — no Neon dual-write. Base detect (no Adapt). */
  store: StoreData;
  /** Alias of heuristic (callers / format). */
  metrics: EvalMetrics;
  heuristic: EvalMetrics;
  /**
   * Heuristic after Adapt taxonomyOverrides. Null when overrides are omitted
   * (template / explicit `overrides: null`).
   */
  adapted: EvalMetrics | null;
  /** Base FP/FN examples (conversation-level). */
  confusion: ConfusionExample[];
  adaptedConfusion: ConfusionExample[] | null;
  /** Null when hybrid is skipped (no classify inject and env off). */
  hybrid: EvalMetrics | null;
  llm: LlmPassStats;
}

function skippedLlmStats(): LlmPassStats {
  return {
    enabled: false,
    candidates: 0,
    attempted: 0,
    added: 0,
    failed: 0,
    skipped: 0,
  };
}

function resolveTemplatePath(samplesDir: string): string | null {
  const candidates = [
    path.join(samplesDir, PARTNER_EXPORT_TEMPLATE_FILE),
    path.join(FIXTURES_DIR, PARTNER_EXPORT_TEMPLATE_FILE),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function resolvePartnerExportPath(
  samplesDir: string = SAMPLES_DIR,
  /** Force template (tests / CI). */
  preferTemplate = false,
  /** Score week-2 held-out CSV only (never falls back to week-1). */
  preferWeek2 = false
): { source: PartnerExportSource; filename: string; absolutePath: string } {
  if (preferWeek2) {
    const week2Path = path.join(samplesDir, PARTNER_EXPORT_WEEK2_LOCAL_FILE);
    if (!existsSync(week2Path)) {
      throw new Error(
        `Missing week-2 partner export at ${week2Path}. Copy ${PARTNER_EXPORT_TEMPLATE_FILE} to ${PARTNER_EXPORT_WEEK2_LOCAL_FILE}, redact, label ground_truth, then re-run with --week2. Do not use week-1 ${PARTNER_EXPORT_LOCAL_FILE} as week-2.`
      );
    }
    return {
      source: "week2",
      filename: PARTNER_EXPORT_WEEK2_LOCAL_FILE,
      absolutePath: week2Path,
    };
  }

  const localPath = path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE);
  const templatePath = resolveTemplatePath(samplesDir);

  if (!preferTemplate && existsSync(localPath)) {
    return {
      source: "local",
      filename: PARTNER_EXPORT_LOCAL_FILE,
      absolutePath: localPath,
    };
  }

  if (!templatePath) {
    throw new Error(
      `Missing partner export template at ${path.join(FIXTURES_DIR, PARTNER_EXPORT_TEMPLATE_FILE)}. Expected ${PARTNER_EXPORT_TEMPLATE_FILE} under src/data/fixtures/.`
    );
  }

  return {
    source: "template",
    filename: PARTNER_EXPORT_TEMPLATE_FILE,
    absolutePath: templatePath,
  };
}

function pct(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function resolveEvalOverrides(
  source: PartnerExportSource,
  overrides?: TaxonomyOverrides | null
): TaxonomyOverrides | null {
  if (overrides === null) return null;
  if (overrides !== undefined) return overrides;
  return source === "local" || source === "week2"
    ? PARTNER_EXPORT_ADAPT_OVERRIDES
    : null;
}

/** Load CSV → ingest → heuristic detect → labeled metrics; optional hybrid pass 2. */
export async function loadPartnerExportEval(options?: {
  samplesDir?: string;
  preferTemplate?: boolean;
  /** Score week-2 held-out CSV (requires week2.local.csv; no week-1 fallback). */
  preferWeek2?: boolean;
  tenantId?: string;
  classify?: LlmClassifyFn;
  maxCalls?: number;
  concurrency?: number;
  /** When true, never run hybrid even if DETECT_LLM=1 (UI measurement dry-run). */
  skipHybrid?: boolean;
  /**
   * Adapt terms for the second heuristic pass.
   * Default: partner-export fixture when `source=local` or `week2`; none for template.
   * Pass `null` to skip Adapt even on local / week2 CSV.
   */
  overrides?: TaxonomyOverrides | null;
}): Promise<PartnerExportEvalResult> {
  const tenantId = options?.tenantId ?? TENANT_ID;
  const resolved = resolvePartnerExportPath(
    options?.samplesDir ?? SAMPLES_DIR,
    options?.preferTemplate ?? false,
    options?.preferWeek2 ?? false
  );
  const content = readFileSync(resolved.absolutePath, "utf8");
  const doc = parseIngestDocument(resolved.filename, content);
  const { conversations, messages } = toStoreRecords(
    doc.conversations,
    tenantId
  );
  const heuristicSignals = runDetection(conversations, messages, tenantId);
  const adaptOverrides = resolveEvalOverrides(resolved.source, options?.overrides);
  const adaptedSignals = adaptOverrides
    ? runDetection(conversations, messages, tenantId, adaptOverrides)
    : null;

  const store: StoreData = {
    tenant: {
      id: tenantId,
      name: "Partner export eval",
      createdAt: "2026-08-06T00:00:00.000Z",
    },
    conversations,
    messages,
    signals: heuristicSignals,
    pilot: { baselineOpportunities: 0 },
    taxonomyOverrides: adaptOverrides ?? {},
  };

  const heuristic = computeEvalMetrics(store);
  const confusion = listConfusionExamples(store);
  const adaptedStore = adaptedSignals
    ? { ...store, signals: adaptedSignals }
    : null;
  const adapted = adaptedStore ? computeEvalMetrics(adaptedStore) : null;
  const adaptedConfusion = adaptedStore
    ? listConfusionExamples(adaptedStore)
    : null;

  const shouldHybrid =
    !options?.skipHybrid &&
    (Boolean(options?.classify) || isDetectLlmEnabled());

  if (!shouldHybrid) {
    return {
      ...resolved,
      store,
      metrics: heuristic,
      heuristic,
      adapted,
      confusion,
      adaptedConfusion,
      hybrid: null,
      llm: skippedLlmStats(),
    };
  }

  const { signals: hybridSignals, llm } = await runHybridDetection(
    conversations,
    messages,
    tenantId,
    adaptOverrides,
    {
      classify: options?.classify,
      maxCalls: options?.maxCalls,
      concurrency: options?.concurrency,
    }
  );
  const hybrid = computeEvalMetrics({
    ...store,
    signals: hybridSignals,
  });

  return {
    ...resolved,
    store,
    metrics: heuristic,
    heuristic,
    adapted,
    confusion,
    adaptedConfusion,
    hybrid,
    llm,
  };
}

/** Compact CLI-friendly summary for pilots. */
export function formatPartnerExportMetrics(metrics: EvalMetrics): string {
  const lines = [
    `labeled=${metrics.labeledConversations} P=${pct(metrics.labeledPrecision)} R=${pct(metrics.labeledRecall)} TP=${metrics.truePositives} FP=${metrics.falsePositives} FN=${metrics.falseNegatives}`,
    ...metrics.byType.map(
      (row) =>
        `${row.type}: labeled=${row.labeledCount} P=${pct(row.precision)} R=${pct(row.recall)}`
    ),
  ];
  return lines.join("\n");
}

/** Hybrid vs heuristic one-liner (or skipped). */
export function formatPartnerExportHybridLine(
  heuristic: EvalMetrics,
  hybrid: EvalMetrics | null,
  llm: LlmPassStats
): string {
  if (!hybrid || !llm.enabled) {
    return "hybrid=skipped";
  }
  return `hybrid vs heuristic: P ${pct(heuristic.labeledPrecision)}→${pct(hybrid.labeledPrecision)} R ${pct(heuristic.labeledRecall)}→${pct(hybrid.labeledRecall)} TP ${heuristic.truePositives}→${hybrid.truePositives} FP ${heuristic.falsePositives}→${hybrid.falsePositives} FN ${heuristic.falseNegatives}→${hybrid.falseNegatives} | llm attempted=${llm.attempted} added=${llm.added} failed=${llm.failed} skipped=${llm.skipped}`;
}

/** Full CLI block: source + heuristic + optional Adapt + hybrid (or skipped). */
export function formatPartnerExportEval(result: PartnerExportEvalResult): string {
  const lines = [
    `source=${result.source} file=${result.filename}`,
    "heuristic:",
    formatPartnerExportMetrics(result.heuristic),
  ];
  if (result.confusion.length > 0) {
    lines.push("confusion (base):");
    lines.push(formatConfusionExamples(result.confusion, 20));
  }
  if (result.adapted) {
    lines.push("heuristic (adapt):");
    lines.push(formatPartnerExportMetrics(result.adapted));
  }
  if (result.hybrid && result.llm.enabled) {
    lines.push("hybrid:", formatPartnerExportMetrics(result.hybrid));
    lines.push(
      formatPartnerExportHybridLine(
        result.adapted ?? result.heuristic,
        result.hybrid,
        result.llm
      )
    );
  } else {
    lines.push(
      formatPartnerExportHybridLine(
        result.adapted ?? result.heuristic,
        result.hybrid,
        result.llm
      )
    );
  }
  return lines.join("\n");
}
