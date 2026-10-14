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
  assert.match(job, /archive="gitleaks_\$\{version\}_linux_x64\.tar\.gz"/);
  assert.match(job, /a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb/);
  assert.match(job, /sha256sum -c/);
  assert.match(job, /gitleaks detect --source \. --config \.gitleaks\.toml --redact --no-banner/);
  assert.doesNotMatch(job, /gitleaks-action/);
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
  // Keep the synthetic secret assembled at runtime so the repository-wide
  // history scan does not flag this test's own negative fixture.
  const extra = "aws_access_key_id=" + [65, 75, 73, 65].map((code) => String.fromCharCode(code)).join("") + "BCDEFGHIJK234567\n";
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

test("only the exact synthetic budget actor key and test path are exempt", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cb07-actor-scan-"));
  const relative = "web/src/lib/backend-client.test.ts";
  const dir = path.join(tmp, "web/src/lib");
  const fixture = path.join(tmp, relative);
  const original = fs.readFileSync(path.join(root, relative), "utf8");
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
    assert.equal(result.status, 0, "documented synthetic test key must be exempt: " + result.stderr);
    const distinct = ["synthetic-actor-key", "at-least-34-bytes"].join("-");
    const otherKey = `vi.stubEnv("SIOONA_ACTOR_KEY", "${distinct}");\n`;
    fs.appendFileSync(fixture, otherKey);
    result = scan();
    assert.equal(result.status, 1, "an additional secret in the same test file must fail");
    fs.writeFileSync(fixture, original.replace("synthetic-actor-key-at-least-32-bytes", distinct));
    result = scan();
    assert.equal(result.status, 1, "a different key in the exempt file must fail");
    fs.rmSync(fixture);
    fs.writeFileSync(path.join(dir, "other.test.ts"), original);
    result = scan();
    assert.equal(result.status, 1, "the same synthetic key in a different file must fail");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("only the exact synthetic pilot idempotency keys and test path are exempt", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cb13-pilot-scan-"));
  const relative = "backend/tests/test_pilot_requests.py";
  const dir = path.join(tmp, "backend/tests");
  const fixture = path.join(tmp, relative);
  const sample = 'headers = {"Idempotency-Key": "' + ["global", "pilot", "test", "0001"].join("-") + '"}\n';
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
    fs.writeFileSync(fixture, sample);
    let result = scan();
    assert.equal(result.status, 0, "documented synthetic pilot test keys must be exempt: " + result.stderr);
    const extraKey = 'headers = {"Idempotency-Key": "' + ["global", "pilot", "test", "0009"].join("-") + '"}\n';
    fs.appendFileSync(fixture, extraKey);
    result = scan();
    assert.equal(result.status, 1, "an additional secret in the same file must fail");
    fs.writeFileSync(fixture, sample);
    fs.writeFileSync(path.join(dir, "other.py"), sample);
    result = scan();
    assert.equal(result.status, 1, "the same idempotency keys in a different file must fail");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
