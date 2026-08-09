import { promises as fs } from "fs";
import path from "path";
import { runDetection } from "./detect";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import { resetStore, writeStore } from "./store";
import type { StoreData } from "./types";

const SAMPLES_DIR = path.join(process.cwd(), "data", "samples");

/** Platform samples layered on fixture reset for the partner pitch path. */
const PARTNER_DEMO_SAMPLES = [
  "sample-intercom.json",
  "sample-whatsapp.txt",
] as const;

/**
 * Cold-demo “their process” estimate — intentionally below Sioona’s find rate
 * so Insights can show missed vs found without a real partner baseline.
 */
export const DEMO_BASELINE_OPPORTUNITIES = 4;
export const DEMO_BASELINE_NOTE =
  "Cold-demo estimate: what a busy desk typically flags without Shadow Mode. Replace with the partner’s real count on Eval.";

export interface PartnerDemoResult {
  store: StoreData;
  importedConversations: number;
  newSignals: number;
  samples: string[];
  baselineOpportunities: number;
  opportunityLift: number;
}

/**
 * Reset to labeled fixtures, then ingest Intercom + WhatsApp samples so a
 * cold demo shows seed + platform-ingest signals without a partner file.
 * Sets a demo baseline so lift / “missed opportunities” is visible immediately.
 */
export async function runPartnerDemo(): Promise<PartnerDemoResult> {
  const store = await resetStore();
  let importedConversations = 0;
  let newSignals = 0;
  const samples: string[] = [];

  for (const name of PARTNER_DEMO_SAMPLES) {
    const content = await fs.readFile(path.join(SAMPLES_DIR, name), "utf8");
    const { conversations: parsed } = parseIngestDocument(name, content);
    if (parsed.length === 0) continue;

    const { conversations, messages } = toStoreRecords(
      parsed,
      store.tenant.id
    );
    store.conversations.push(...conversations);
    store.messages.push(...messages);

    const detected = runDetection(
      conversations,
      messages,
      store.tenant.id,
      store.taxonomyOverrides
    );
    store.signals.push(...detected);

    importedConversations += conversations.length;
    newSignals += detected.length;
    samples.push(name);
  }

  const sioonaOpportunities = new Set(
    store.signals.map((s) => s.conversationId)
  ).size;

  store.pilot = {
    baselineOpportunities: DEMO_BASELINE_OPPORTUNITIES,
    baselineNote: DEMO_BASELINE_NOTE,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(store);
  return {
    store,
    importedConversations,
    newSignals,
    samples,
    baselineOpportunities: DEMO_BASELINE_OPPORTUNITIES,
    opportunityLift: sioonaOpportunities - DEMO_BASELINE_OPPORTUNITIES,
  };
}
