import { expect, it } from "vitest";
import { comparePromotion, verifyExternalCorpus } from "./holdout";
import { loadThresholds } from "./compare";
import { loadManifest } from "../gold/load";
import { runGate } from "./run-gate";
it("metadata alone cannot promote", async () => {
  const synthetic = await runGate({ git: { sha: "test", dirty: false } });
  expect(comparePromotion(synthetic.artifact, null, null, loadManifest(), loadThresholds()).map(x => x.code)).toContain("holdout_unverified");
});
it("rejects repository paths before opening corpus bytes", () => {
  expect(() => verifyExternalCorpus("web/eval/gold/validation/items.jsonl", loadManifest())).toThrow("external_path_required");
});
it("rejects missing external corpus without leaking its path", () => {
  expect(() => verifyExternalCorpus("/tmp/nonexistent-cb09-holdout.json", loadManifest())).toThrow("holdout_unavailable");
});
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { candidateIdentity } from "./identity";
it("verifies bytes/count and uses labeled synthetic external data without product writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "holdout-contract-"));
  const path = join(dir, "synthetic.json");
  const bytes = JSON.stringify([{groundTruth:"lead", messages:[{role:"customer",content:"I want to open an account"}]}]);
  const manifest = { ...loadManifest(), holdout: { id: "synthetic", sha256: createHash("sha256").update(bytes).digest("hex"), n: 1 } };
  try {
    writeFileSync(path, bytes);
    expect(verifyExternalCorpus(path, manifest)).toHaveLength(1);
    expect(() => verifyExternalCorpus(path, { ...manifest, holdout: { ...manifest.holdout, n: 2 } })).toThrow("holdout_count");
    writeFileSync(path, bytes + " ");
    expect(() => verifyExternalCorpus(path, manifest)).toThrow("holdout_checksum");
  } finally { rmSync(dir, { recursive:true }); }
});
it("blocks incomplete, mismatched and malformed aggregate results", async () => {
  const synthetic = (await runGate({ git: {sha: candidateIdentity().source_sha,dirty:false} })).artifact;
  const artifact = structuredClone(synthetic);
  artifact.route.mode = "live";
  artifact.corpus.split = "holdout";
  artifact.corpus.manifest_sha256 = loadManifest().holdout.sha256!;
  artifact.corpus.n = 120;
  artifact.coverage = {completed:120,eligible:120,rate:1,screened_out:0,failed:0};
  artifact.cost = {attempts:120,unknown_cost_attempts:120,estimated_usd:null,unknown_cost_fraction:1};
  const manifest = {...loadManifest(),holdout:{...loadManifest().holdout,n:120}};
  const result = {version:1 as const,identity:candidateIdentity(),artifact};
  expect(comparePromotion(synthetic, result, {...result,artifact:{...artifact,coverage:{...artifact.coverage,failed:1}}}, manifest,loadThresholds())[0].code).toBe("holdout_invalid");
  expect(comparePromotion(synthetic, result, {...result,identity:{...result.identity,config_sha256:"a".repeat(64)}}, manifest,loadThresholds())[0].code).toBe("candidate_mismatch");
  const bad = structuredClone(result); bad.artifact.per_type.lead.precision = Number.NaN;
  expect(comparePromotion(synthetic,result,bad,manifest,loadThresholds())[0].code).toBe("holdout_invalid");
});
it("emits aggregate artifacts without transcript, quote or item output fields", async () => {
  const marker = "Synthetic private quote that must stay out of aggregate artifacts";
  const manifest = loadManifest();
  const { artifact } = await runGate({items:[{id:"synthetic-private",split:"validation",label:"lead",language:"en",tags:[],tenantId:"tenant_eval",customerName:"Customer",channel:"upload",messages:[{role:"customer",content:marker}]}],manifest,git:{sha:candidateIdentity().source_sha,dirty:false},baseline:null,classifyOverride:async()=>({type:"lead",confidence:0.99,summary:"Synthetic",quotes:[marker]})});
  const serialized = JSON.stringify({version:1,identity:candidateIdentity(),artifact});
  expect(serialized).not.toContain(marker);
  expect(serialized).not.toContain("synthetic-private");
  expect(serialized).not.toMatch(/"(?:messages|quotes|content|outputs|transcript)"\s*:/);
});
