import type { TaxonomyOverrides } from "@/lib/types";

/**
 * Adapt terms from the scored `real-partner-export.local.csv` FP/FN set.
 * Merged via `getEffectiveTaxonomy` — do not copy these into `taxonomy.ts`.
 *
 * Grounding (conversation external ids, 2026-08-14):
 * - Lead FP / upsell miss: `apart_middle_4599_rkma`, `big_chart_8139_elr8`,
 *   `mani_kanta07_3dn1` — existing SIP / portfolio-review threads; canned
 *   “want to open” fired lead.
 * - Lead FP / retention miss: `sufficient_fee_6975_kc75_ret` — funds-out
 *   “move my money” lost to lead keywords (invest / savings / FD).
 * - Upsell miss (no signal): `academic_quote4948_zdp8` (portfolio review),
 *   `vijayb234_4cyt` (increase current SIP), `nocut8130_08n1` (where to start).
 */
export const PARTNER_EXPORT_ADAPT_OVERRIDES: TaxonomyOverrides = {
  lead: {
    negativePhrases: [
      "portfolio review",
      "already doing sip",
      "move my money",
    ],
  },
  upsell: {
    phrases: [
      "portfolio review",
      "already doing sip",
      "increase investment",
      "where do i even start",
    ],
  },
};
