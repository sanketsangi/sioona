import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { candidateIdentity, promptConstructionHash, verifyCaptureIdentity } from "./identity";
it("a prompt edit changes identity without a version bump", () => {
  const read = (path:string) => readFileSync(new URL(`../../../${path}`, import.meta.url),"utf8");
  const original = promptConstructionHash(read);
  const changed = promptConstructionHash(path => read(path).replace("Classify one Indian", "Classify one changed Indian"));
  expect(original).not.toBe(changed);
});
it("legacy captures require their exact archived bytes", () => {
  expect(verifyCaptureIdentity({item_id:"val-lead-01",capture_sha256:"0".repeat(64)})).toBe(false);
  expect(verifyCaptureIdentity({item_id:"synthetic",identity:candidateIdentity()})).toBe(true);
});

it("binds effective retry configuration without changing request identity", () => {
  try {
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "1");
    const one = candidateIdentity();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "4");
    expect(candidateIdentity().config_sha256).not.toBe(one.config_sha256);
    expect(candidateIdentity().request_config_sha256).toBe(one.request_config_sha256);
  } finally { vi.unstubAllEnvs(); }
});
