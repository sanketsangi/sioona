import type { StoreData } from "@/lib/types";

/**
 * Empty runtime shell. Conversations come from JSON via
 * `loadTestingJsonIntoStore` (cold start / reset: testing.json;
 * Partner Demo: zerodha_batch_02.json).
 * Labeled P/R=1.0 fixtures live in `detect-eval-fixtures.ts` (tests only).
 */
export const emptyShowcaseStore: StoreData = {
  tenant: {
    id: "tenant_demo",
    name: "Acme Inc.",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  conversations: [],
  messages: [],
  signals: [],
  pilot: { baselineOpportunities: 0 },
  taxonomyOverrides: {},
  auditEvents: [],
};
