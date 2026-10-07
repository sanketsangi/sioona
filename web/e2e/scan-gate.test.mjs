import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

function jobBlock(workflow, id) {
  const marker = `\n  ${id}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow is missing the ${id} job`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test("Dependabot covers web, site, backend, and GitHub Actions", () => {
  const raw = fs.readFileSync(path.join(root, ".github/dependabot.yml"), "utf8");
  for (const snippet of [
    "package-ecosystem: npm, directory: /web",
    "package-ecosystem: npm, directory: /site",
    "package-ecosystem: pip, directory: /backend",
    "package-ecosystem: github-actions, directory: /",
  ]) {
    assert.match(raw, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Gitleaks CI scans the repository and the canary fixture", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/test.yml"), "utf8");
  const job = jobBlock(workflow, "gitleaks");
  assert.match(job, /name: Gitleaks/);
  assert.match(job, /gitleaks\/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e/);
  assert.match(job, /pull-requests: read/);
  assert.match(job, /GITLEAKS_ENABLE_COMMENTS: false/);
  assert.match(job, /secret-scan-fixture/);
  const allow = fs.readFileSync(path.join(root, ".gitleaks.toml"), "utf8");
  assert.match(allow, /secret-scan-fixture/);
});

test("the scanner flags the harmless canary fixture", () => {
  const fixture = path.join(root, ".github/secret-scan-fixture/canary.txt");
  const source = fs.readFileSync(fixture, "utf8");
  assert.match(source, /AKIA234567BCDEFGHIJK/);
  assert.match(source, /not a credential/);
  const gitleaks = process.env.GITLEAKS_BIN || "gitleaks";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cb02-scan-"));
  try {
    fs.copyFileSync(fixture, path.join(tmp, "canary.txt"));
    const run = spawnSync(gitleaks, ["detect", "--no-git", "--source", tmp, "--no-banner", "--redact"], {
      encoding: "utf8",
    });
    assert.equal(run.status, 1, run.stderr || run.stdout);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
