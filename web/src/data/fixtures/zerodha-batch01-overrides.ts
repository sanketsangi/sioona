import type { TaxonomyOverrides } from "@/lib/types";

/**
 * Adapt terms from Zerodha `batch_01.json` FP/FN set (pilot 2026-08-15).
 * Merged via `getEffectiveTaxonomy` — do **not** copy into `taxonomy.ts`.
 *
 * Grounding (conversation external ids):
 * - Lead FP / upsell miss: `sameer_nair_89` — existing Coin SIP + ELSS; lead
 *   fired on SIP language. Lead negatives + upsell “start another sip” / ELSS.
 * - Upsell FP on new account: `isha_verma_35` — “first time” F&O; upsell
 *   negatives + lead “account just got activated”.
 * - Upsell misses: smallcase / Coin SIP / commodity / MCX / Kite Connect /
 *   currency / pledge-for-margin (existing customers, same login).
 * - Retention misses: pause F&O/trading/account, close/closure, switch to
 *   Groww/Dhan/Upstox, “another broker”.
 * - Batch_02 tiny pass: `tanya_bhatia_48` lead FP on “can i start”+KYC →
 *   lead negatives `start coin sips` / `without fresh kyc`; held-out upsell
 *   phrases (bump SIP, Connect, DDPI, pledge for, …). Skip `gtt sell` —
 *   it FPs batch_01 ops/new-login chats.
 *
 * Held-out check: lifts batch_02 recall without collapsing precision
 * (measurement only — not a customer claim).
 */
export const ZERODHA_BATCH01_ADAPT_OVERRIDES: TaxonomyOverrides = {
  lead: {
    phrases: [
      "account just got activated",
      "for the first time",
      "don't have zerodha yet",
      "can i open zerodha",
      "open zerodha",
      "nro trading",
      "want to switch",
      "opening zerodha",
    ],
    negativePhrases: [
      "i already sip",
      "already sip a",
      "start another sip",
      "same mandate",
      "start coin sips",
      "without fresh kyc",
    ],
  },
  upsell: {
    phrases: [
      "activate commodities",
      "enable commodity",
      "monthly coin sip",
      "start coin sips",
      "want a monthly coin sip",
      "want coin sips",
      "run a smallcase",
      "try a smallcase",
      "try one smallcase",
      "want kite connect",
      "want connect",
      "connect script",
      "currency derivatives",
      "activate currency",
      "want currency",
      "usdinr",
      "pledge them for",
      "pledge for",
      "elss for 80c",
      "want to increase it",
      "start another sip",
      "bump it to",
      "booster sip",
      "enable ddpi",
      "same login",
      "lumpsum on coin",
      "mfs on coin",
      "more usable margin",
      "same mandate ok",
      "earmarked for",
    ],
    negativePhrases: [
      "for the first time",
      "account just got activated",
      "don't have zerodha yet",
      "mandate pending",
      "orders return",
    ],
  },
  retention: {
    phrases: [
      "pause f&o",
      "pause trading",
      "pausing this account",
      "pause coin sips",
      "close this resident account",
      "account closure",
      "close zerodha",
      "closing this",
      "closing kite",
      "look at another broker",
      "another broker's",
      "moving to dhan",
      "transfer to upstox",
      "move sips out",
      "on groww now",
      "pause here",
    ],
  },
};
