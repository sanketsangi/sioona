/**
 * In-process cache of Sample / Partner Demo packs (chats + signals already
 * detected). Warm once so Vault / Run Partner Demo can writeStore instantly
 * and paint Insights without re-running detect.
 */
import { promises as fs } from "fs";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import {
  runHybridDetection,
  type LlmPassStats,
} from "@/lib/detect-llm";
import { toStoreRecords } from "@/lib/ingest";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
} from "@/lib/demo-baseline";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
  parseTestingJsonDocument,
  resolveTestingJsonPath,
  resolveZerodhaBatch02Path,
} from "@/lib/testing-json-eval";
import type { Conversation, Message, Signal, StoreData } from "@/lib/types";
import type { VaultShowcaseKind } from "@/lib/vault-showcase";

export type ShowcasePackCorpus = {
  kind: VaultShowcaseKind;
  sampleName: string;
  conversations: Conversation[];
  messages: Message[];
  signals: Signal[];
  detectLlm: LlmPassStats;
};

const cache = new Map<VaultShowcaseKind, ShowcasePackCorpus>();
const inflight = new Map<VaultShowcaseKind, Promise<ShowcasePackCorpus>>();

function resolveKindPaths(kind: VaultShowcaseKind): {
  sampleName: string;
  resolvePath: () => string;
} {
  if (kind === "sample") {
    return {
      sampleName: GROWW_SHOWCASE_SAMPLE_NAME,
      resolvePath: () => resolveTestingJsonPath(),
    };
  }
  return {
    sampleName: ZERODHA_BATCH02_SAMPLE_NAME,
    resolvePath: () => resolveZerodhaBatch02Path(),
  };
}

async function buildShowcasePack(
  kind: VaultShowcaseKind,
): Promise<ShowcasePackCorpus> {
  const { sampleName, resolvePath } = resolveKindPaths(kind);
  const absolutePath = resolvePath();
  const content = await fs.readFile(absolutePath, "utf8");
  const inputs = parseTestingJsonDocument(content);
  const tenantId = emptyShowcaseStore.tenant.id;
  const { conversations, messages } = toStoreRecords(inputs, tenantId, {
    stableIds: true,
  });
  const { signals, llm: detectLlm } = await runHybridDetection(
    conversations,
    messages,
    tenantId,
    emptyShowcaseStore.taxonomyOverrides,
  );

  return {
    kind,
    sampleName,
    conversations,
    messages,
    signals,
    detectLlm,
  };
}

/** Build (or reuse) a showcase pack. Concurrent callers share one build. */
export async function getOrBuildShowcasePack(
  kind: VaultShowcaseKind,
): Promise<ShowcasePackCorpus> {
  const hit = cache.get(kind);
  if (hit) return hit;
  const pending = inflight.get(kind);
  if (pending) return pending;

  const build = buildShowcasePack(kind)
    .then((pack) => {
      cache.set(kind, pack);
      inflight.delete(kind);
      return pack;
    })
    .catch((err) => {
      inflight.delete(kind);
      throw err;
    });
  inflight.set(kind, build);
  return build;
}

/** Warm Sample + Partner Demo in parallel (sidebar / idle). Fail-soft. */
export async function warmShowcasePacks(): Promise<{
  sample: boolean;
  partner: boolean;
}> {
  const [sample, partner] = await Promise.allSettled([
    getOrBuildShowcasePack("sample"),
    getOrBuildShowcasePack("partner"),
  ]);
  return {
    sample: sample.status === "fulfilled",
    partner: partner.status === "fulfilled",
  };
}

/** True when this isolate already has the pack ready. */
export function isShowcasePackCached(kind: VaultShowcaseKind): boolean {
  return cache.has(kind);
}

/** Test helper — drop in-memory packs between cases. */
export function clearShowcasePackCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Materialize a live store snapshot from a cached corpus (deep clone).
 * Does not write — caller writeStore / set pilot.
 */
export function storeFromShowcasePack(
  pack: ShowcasePackCorpus,
  opts?: { applyDemoBaseline?: boolean },
): StoreData {
  const store: StoreData = {
    ...structuredClone(emptyShowcaseStore),
    conversations: structuredClone(pack.conversations),
    messages: structuredClone(pack.messages),
    signals: structuredClone(pack.signals),
  };

  if (opts?.applyDemoBaseline) {
    store.pilot = {
      baselineOpportunities: DEMO_BASELINE_OPPORTUNITIES,
      baselineNote: DEMO_BASELINE_NOTE,
      updatedAt: new Date().toISOString(),
      lastUploadedFileName: pack.sampleName,
    };
  } else {
    store.pilot = {
      baselineOpportunities: 0,
      updatedAt: new Date().toISOString(),
      lastUploadedFileName: pack.sampleName,
    };
  }

  return store;
}
