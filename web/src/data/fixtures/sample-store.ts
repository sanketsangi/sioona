import type { StoreData } from "@/lib/types";

/**
 * Empty runtime shell. Conversations come from testing.json via
 * `loadTestingJsonIntoStore` (cold start, reset, Partner Demo).
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
