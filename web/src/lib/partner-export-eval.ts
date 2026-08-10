import { existsSync, readFileSync } from "fs";
import path from "path";
import { runDetection } from "./detect";
import { computeEvalMetrics, type EvalMetrics } from "./eval";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import type { StoreData } from "./types";

const SAMPLES_DIR = path.join(process.cwd(), "data/samples");

/** Committed redacted template — safe for the repo. */
export const PARTNER_EXPORT_TEMPLATE_FILE =
  "real-partner-export.template.csv";

/**
 * Local drop-in for Day-1 pilot chats (gitignored).
 * Copy the template, replace rows with redacted partner transcripts + ground_truth.
 */
export const PARTNER_EXPORT_LOCAL_FILE = "real-partner-export.local.csv";

const TENANT_ID = "tenant_demo";

export type PartnerExportSource = "local" | "template";

export interface PartnerExportEvalResult {
  source: PartnerExportSource;
  filename: string;
  absolutePath: string;
  store: StoreData;
  metrics: EvalMetrics;
}

export function resolvePartnerExportPath(
  samplesDir: string = SAMPLES_DIR,
  /** Force template (tests / CI). */
  preferTemplate = false
): { source: PartnerExportSource; filename: string; absolutePath: string } {
  const localPath = path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE);
  const templatePath = path.join(samplesDir, PARTNER_EXPORT_TEMPLATE_FILE);

  if (!preferTemplate && existsSync(localPath)) {
    return {
      source: "local",
      filename: PARTNER_EXPORT_LOCAL_FILE,
      absolutePath: localPath,
    };
  }

  if (!existsSync(templatePath)) {
    throw new Error(
      `Missing partner export template at ${templatePath}. Expected ${PARTNER_EXPORT_TEMPLATE_FILE} under data/samples/.`
    );
  }

  return {
    source: "template",
    filename: PARTNER_EXPORT_TEMPLATE_FILE,
    absolutePath: templatePath,
  };
}

/** Load CSV → ingest → detect → labeled eval metrics (overall + per-type). */
export function loadPartnerExportEval(options?: {
  samplesDir?: string;
  preferTemplate?: boolean;
  tenantId?: string;
}): PartnerExportEvalResult {
  const tenantId = options?.tenantId ?? TENANT_ID;
  const resolved = resolvePartnerExportPath(
    options?.samplesDir ?? SAMPLES_DIR,
    options?.preferTemplate ?? false
  );
  const content = readFileSync(resolved.absolutePath, "utf8");
  const doc = parseIngestDocument(resolved.filename, content);
  const { conversations, messages } = toStoreRecords(
    doc.conversations,
    tenantId
  );
  const signals = runDetection(conversations, messages, tenantId);

  const store: StoreData = {
    tenant: {
      id: tenantId,
      name: "Partner export eval",
      createdAt: "2026-08-06T00:00:00.000Z",
    },
    conversations,
    messages,
    signals,
    pilot: { baselineOpportunities: 0 },
  };

  return {
    ...resolved,
    store,
    metrics: computeEvalMetrics(store),
  };
}

/** Compact CLI-friendly summary for pilots. */
export function formatPartnerExportMetrics(metrics: EvalMetrics): string {
  const pct = (value: number | null) =>
    value === null ? "n/a" : value.toFixed(2);
  const lines = [
    `labeled=${metrics.labeledConversations} P=${pct(metrics.labeledPrecision)} R=${pct(metrics.labeledRecall)} TP=${metrics.truePositives} FP=${metrics.falsePositives} FN=${metrics.falseNegatives}`,
    ...metrics.byType.map(
      (row) =>
        `${row.type}: labeled=${row.labeledCount} P=${pct(row.precision)} R=${pct(row.recall)}`
    ),
  ];
  return lines.join("\n");
}
