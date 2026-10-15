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
  const bytes = JSON.stringify([{groundTruth:"lead", evaluation:{language:"en",tags:[],injection:null}, messages:[{role:"customer",content:"I want to open an account"}]}]);
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
  const result = {version:1 as const,identity:candidateIdentity(),artifact,annotation_coverage:{reviewed:120,injection:0,languages:{en:120,hi:0,hinglish:0}}};
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

import { assertHoldoutFeasible, assertHoldoutItems, holdoutResultDigest, assertRecordableHoldout } from "./holdout";
import { scoreCorpus } from "./compare";
import { GOLD_LABELS, type GoldItem } from "../gold/load";
it("rejects the frozen 100-item holdout before corpus reads or provider work", () => {
  expect(() => assertHoldoutFeasible(loadManifest(), loadThresholds())).toThrow("holdout_sample_size");
});
it("checks class distribution and reviewed annotations before provider work", () => {
  const items = GOLD_LABELS.flatMap(label => Array.from({length:30}, (_,i) => ({id:`${label}-${i}`,label,language:"en",tags:[],split:"validation",tenantId:"tenant_eval",customerName:"Customer",channel:"upload",messages:[{role:"customer",content:"Synthetic customer text"}]} as GoldItem)));
  expect(() => assertHoldoutItems(items, loadThresholds())).not.toThrow();
  items[0].label = "lead";
  expect(() => assertHoldoutItems(items, loadThresholds())).toThrow("holdout_class_size");
});
it("requires an approved baseline identity and digest and rejects the wrong baseline", () => {
  const identity = candidateIdentity();
  const manifest = {...loadManifest(),holdout:{...loadManifest().holdout,n:120}};
  const rows = GOLD_LABELS.flatMap(gold => Array.from({length:30}, (_,i) => ({id:`${gold}-${i}`,gold,surfaced:gold === "none" ? [] : [gold] as ("lead"|"retention"|"upsell")[],explicitNone:gold === "none",screenedOut:false,completed:true,failed:false,quotes:gold === "none" ? [] : [{text:"Synthetic",valid:true}],injectionAttack:null,tenantFailure:false})));
  const artifact = scoreCorpus(rows,{git_sha:identity.source_sha,git_dirty:false,corpus:{id:"external",split:"holdout",manifest_sha256:manifest.holdout.sha256!,n:120},route:{mode:"live",route_version:"test",models:[],prompt_version:"test"},cost:{attempts:120,unknown_cost_attempts:120,unknown_cost_fraction:1,estimated_usd:null}});
  const result = {version:1 as const,identity,artifact,annotation_coverage:{reviewed:120,injection:0,languages:{en:120,hi:0,hinglish:0}}};
  expect(comparePromotion(artifact,result,result,manifest,loadThresholds(),identity).map(x=>x.code)).toContain("baseline_unapproved");
  const approval = {identity,result_sha256:holdoutResultDigest(result)};
  expect(comparePromotion(artifact,result,result,manifest,loadThresholds(),identity,approval)).toEqual([]);
  expect(comparePromotion(artifact,result,result,manifest,loadThresholds(),identity,{...approval,identity:{...identity,source_sha:"a".repeat(40)}})[0].code).toBe("baseline_mismatch");
  expect(comparePromotion(artifact,result,result,manifest,loadThresholds(),identity,{...approval,result_sha256:"b".repeat(64)})[0].code).toBe("baseline_mismatch");
  expect(() => assertRecordableHoldout({...result,artifact:{...artifact,coverage:{...artifact.coverage,screened_out:1}}},manifest)).toThrow("holdout_incomplete");
});
it("preserves reviewed language and injection annotations from checksum-bound bytes", async () => {
  const dir=mkdtempSync(join(tmpdir(),"holdout-annotations-"));
  const path=join(dir,"synthetic.json");
  const row={groundTruth:"none",messages:[{role:"customer",content:"I want to open an account"}],evaluation:{language:"hinglish",tags:["injection"],injection:{critical:true,attackLabel:"lead"}}};
  const verify=(data:unknown)=>{const bytes=JSON.stringify([data]);writeFileSync(path,bytes);return verifyExternalCorpus(path,{...loadManifest(),holdout:{id:"synthetic",n:1,sha256:createHash("sha256").update(bytes).digest("hex")}});};
  try {
    const items=verify(row);
    expect(items[0].language).toBe("hinglish");
    expect(items[0].injection?.attackLabel).toBe("lead");
    const {artifact}=await runGate({items,git:{sha:candidateIdentity().source_sha,dirty:false},baseline:null,classifyOverride:async()=>({type:"lead",confidence:0.99,summary:"Synthetic",quotes:[row.messages[0].content]})});
    expect(artifact.injection_critical_failures).toBe(1);
    expect(()=>verify({...row,evaluation:undefined})).toThrow("holdout_annotations");
    expect(()=>verify({...row,evaluation:{...row.evaluation,language:"unknown"}})).toThrow("holdout_annotations");
  } finally {rmSync(dir,{recursive:true});}
});

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
it("offline preflight fails infeasible metadata with no live authorization or private path", () => {
  let output = "";
  try {
    execFileSync(process.execPath, ["--import", "tsx", "eval/gate/holdout.ts", "--preflight"], {
      cwd: resolve("."), env: {...process.env, EVAL_HOLDOUT_AUTHORIZED:"0", EVAL_HOLDOUT_PATH:"/must-not-open", EVAL_HOLDOUT_OUTPUT:"/must-not-write"}, encoding:"utf8",
    });
  } catch (error) { output = String((error as {stdout:unknown}).stdout); }
  expect(JSON.parse(output)).toEqual({code:1,failures:[{code:"holdout_sample_size",detail:"Frozen holdout cannot satisfy unchanged D5"}]});
});
