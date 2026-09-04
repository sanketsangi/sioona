import { existsSync, readFileSync } from "fs";
import path from "path";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "../data/fixtures/partner-export-overrides";
import { ZERODHA_BATCH01_ADAPT_OVERRIDES } from "../data/fixtures/zerodha-batch01-overrides";
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

/** Opt out of Turbopack whole-project fs tracing on Vercel builds. */
function pathExists(absolutePath: string): boolean {
  return existsSync(/*turbopackIgnore: true*/ absolutePath);
}

function readUtf8(absolutePath: string): string {
  return readFileSync(/*turbopackIgnore: true*/ absolutePath, "utf8");
}

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

/**
 * Week-4 Zerodha Batch-02 held-out pack — lives in Synthetic-Data.
 * Score in place; never copy into `web/data/samples/` or ingest to tenant_demo.
 */
export const ZERODHA_WEEK4_BATCH02_FILE = "Zerodha_week_4_batch_02.json";

export const DEFAULT_ZERODHA_WEEK4_BATCH02_PATH = path.join(
  "/Users/sanket/Documents/Synthetic-Data/data/companies/zerodha/Week-4/Batch-02",
  ZERODHA_WEEK4_BATCH02_FILE
);

const TENANT_ID = "tenant_demo";

export type PartnerExportSource =
  | "local"
  | "template"
  | "week2"
  | "week4batch02";

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
  return candidates.find((candidate) => pathExists(candidate)) ?? null;
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
    if (!pathExists(week2Path)) {
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

  if (!preferTemplate && pathExists(localPath)) {
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

function week4Batch02PathFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const fromEnv =
    env.ZERODHA_WEEK4_BATCH02?.trim() ||
    env.PARTNER_EXPORT_WEEK4_BATCH02?.trim();
  return fromEnv || undefined;
}

/** CLI / env: `--week4-batch02` or PARTNER_EXPORT=week4-batch02. */
export function isWeek4Batch02EvalRequested(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    argv.includes("--week4-batch02") ||
    argv.includes("--week4batch02") ||
    env.PARTNER_EXPORT === "week4-batch02" ||
    env.PARTNER_EXPORT === "week4batch02"
  );
}

/**
 * Resolve Week-4 Batch-02 held-out JSON from Synthetic-Data (or an explicit path).
 * Never falls back to week-1 / week-2 samples or copies into `data/samples/`.
 */
export function resolveWeek4Batch02Path(
  explicitPath?: string,
  env: NodeJS.ProcessEnv = process.env
): {
  source: "week4batch02";
  filename: string;
  absolutePath: string;
} {
  const absolutePath =
    explicitPath?.trim() ||
    week4Batch02PathFromEnv(env) ||
    DEFAULT_ZERODHA_WEEK4_BATCH02_PATH;
  if (!pathExists(absolutePath)) {
    throw new Error(
      `Missing week-4 Batch-02 held-out pack at ${absolutePath}. Score ${ZERODHA_WEEK4_BATCH02_FILE} from Synthetic-Data in place (do not copy into web/data/samples/). Do not ingest to tenant_demo.`
    );
  }
  return {
    source: "week4batch02",
    filename: path.basename(absolutePath),
    absolutePath,
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
  if (source === "week4batch02") return ZERODHA_BATCH01_ADAPT_OVERRIDES;
  return source === "local" || source === "week2"
    ? PARTNER_EXPORT_ADAPT_OVERRIDES
    : null;
}

/** Load CSV/JSON → ingest → heuristic detect → labeled metrics; optional hybrid pass 2. */
export async function loadPartnerExportEval(options?: {
  samplesDir?: string;
  preferTemplate?: boolean;
  /** Score week-2 held-out CSV (requires week2.local.csv; no week-1 fallback). */
  preferWeek2?: boolean;
  /**
   * Score Week-4 Zerodha Batch-02 held-out JSON from Synthetic-Data.
   * No samples copy, no Neon dual-write, not Eval go.
   */
  preferWeek4Batch02?: boolean;
  /** Override the Batch-02 JSON path (tests / machines without the default). */
  week4Batch02Path?: string;
  tenantId?: string;
  classify?: LlmClassifyFn;
  maxCalls?: number;
  concurrency?: number;
  /** When true, never run hybrid even if DETECT_LLM=1 (UI measurement dry-run). */
  skipHybrid?: boolean;
  /**
   * Adapt terms for the second heuristic pass.
   * Default: partner-export fixture when `source=local` or `week2`;
   * Zerodha batch_01 Adapt when `source=week4batch02`; none for template.
   * Pass `null` to skip Adapt even on local / week2 / week4batch02.
   */
  overrides?: TaxonomyOverrides | null;
}): Promise<PartnerExportEvalResult> {
  const tenantId = options?.tenantId ?? TENANT_ID;
  const resolved = options?.preferWeek4Batch02
    ? resolveWeek4Batch02Path(options.week4Batch02Path)
    : resolvePartnerExportPath(
        options?.samplesDir ?? SAMPLES_DIR,
        options?.preferTemplate ?? false,
        options?.preferWeek2 ?? false
      );
  const content = readUtf8(resolved.absolutePath);
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
  const lines = [`source=${result.source} file=${result.filename}`];
  if (result.source === "week4batch02") {
    lines.push("note=held-out CLI, not keep-set");
  }
  lines.push("heuristic:", formatPartnerExportMetrics(result.heuristic));
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
