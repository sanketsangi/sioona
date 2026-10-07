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
  const ignored = fs.readFileSync(path.join(root, ".gitleaksignore"), "utf8");
  assert.match(
    ignored,
    /^93f22b7879dd42fc885bea7ba514065b5bfedb74:\.github\/secret-scan-fixture\/canary\.txt:aws-access-token:4$/m,
  );
});

test("the scanner flags the harmless canary fixture", () => {
  const fixture = path.join(root, ".github/secret-scan-fixture/canary.txt");
  const source = fs.readFileSync(fixture, "utf8");
  assert.ok(source.includes(["AKIA", "234567BCDEFGHIJK"].join("")));
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

test("only the exact canary finding is exempt, never other secrets", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cb02-scan-scope-"));
  const dir = path.join(tmp, ".github/secret-scan-fixture");
  const fixture = path.join(dir, "canary.txt");
  const original = fs.readFileSync(path.join(root, ".github/secret-scan-fixture/canary.txt"), "utf8");
  const extra = "aws_access_key_id=" + ["AKIA", "BCDEFGHIJK234567"].join("") + "\n";
  const scan = () => {
    const added = spawnSync("git", ["-C", tmp, "add", "."], { encoding: "utf8" });
    assert.equal(added.status, 0, added.stderr);
    return spawnSync(process.env.GITLEAKS_BIN || "gitleaks", [
      "protect", "--staged", "--source", tmp, "--config", path.join(root, ".gitleaks.toml"), "--no-banner", "--redact",
    ], { encoding: "utf8" });
  };
  try {
    const initialized = spawnSync("git", ["init", tmp], { encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fixture, original);
    let result = scan();
    assert.equal(result.status, 0, result.stderr);
    fs.appendFileSync(fixture, extra);
    result = scan();
    assert.equal(result.status, 1, "extra secret in canary file must fail: " + result.stderr);
    fs.writeFileSync(fixture, original);
    fs.writeFileSync(path.join(dir, "other.env"), extra);
    result = scan();
    assert.equal(result.status, 1, "sibling secret must fail: " + result.stderr);
    fs.writeFileSync(path.join(dir, "other.env"), original);
    result = scan();
    assert.equal(result.status, 1, "canary value outside the exact path must fail: " + result.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
