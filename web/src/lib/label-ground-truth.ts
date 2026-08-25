import type { SignalType } from "./types";

/** Product GT priority for multi-label rows (lower = preferred). */
const PRODUCT_PRIORITY: Record<SignalType, number> = {
  retention: 0,
  upsell: 1,
  lead: 2,
};

/** Source corpus `labels[].signal` → product `groundTruth`. */
export const SOURCE_TO_GT: Record<string, SignalType | "none"> = {
  lead: "lead",
  upsell: "upsell",
  upsell_opportunity: "upsell",
  churn_risk: "retention",
  retention_risk: "retention",
  lead_intent: "lead",
  complaint: "none",
  fraud: "none",
};

interface RawLabel {
  signal?: unknown;
}

function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * Map testing.json / partner `labels[].signal` → single product `groundTruth`.
 * Multi-label: first product signal by priority retention > upsell > lead.
 * Pure complaint/fraud → none.
 */
export function mapTestingLabelsToGroundTruth(
  labels: RawLabel[] | undefined
): SignalType | "none" {
  const product: SignalType[] = [];
  for (const label of labels ?? []) {
    const signal = asTrimmedString(label.signal).toLowerCase();
    const mapped = SOURCE_TO_GT[signal];
    if (mapped && mapped !== "none") {
      product.push(mapped);
    }
  }
  if (product.length === 0) return "none";
  product.sort((a, b) => PRODUCT_PRIORITY[a] - PRODUCT_PRIORITY[b]);
  return product[0];
}
