import assert from "node:assert/strict";
import fs from "node:fs";
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

test("E2E CI job uses CI Postgres, migrations, and heuristics-only mode", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/test.yml"), "utf8");
  const e2e = jobBlock(workflow, "e2e");
  assert.match(e2e, /name: E2E/);
  assert.match(e2e, /image: postgres:17/);
  assert.match(e2e, /POSTGRES_DB: sioona_migration_test/);
  assert.match(e2e, /alembic upgrade head/);
  assert.match(e2e, /DETECT_LLM: "0"/);
  assert.doesNotMatch(e2e, /GROQ_API_KEY/);
  assert.match(e2e, /npm run e2e/);
  assert.match(e2e, /@next\/swc-linux-x64-gnu/);

  const config = fs.readFileSync(path.join(root, "web/playwright.config.ts"), "utf8");
  assert.match(config, /sioona_migration_test/);
  assert.match(config, /DETECT_LLM: "0"/);
  assert.match(config, /GROQ_API_KEY: ""/);

  const nextConfig = fs.readFileSync(path.join(root, "web/next.config.ts"), "utf8");
  assert.match(nextConfig, /telemetry: !process\.env\.CB02_OUTBOUND_AUDIT/);
});

test("upload review spec persists Correct and approval with no provider or outbound calls", () => {
  const spec = fs.readFileSync(path.join(root, "web/e2e/upload-review.spec.ts"), "utf8");
  assert.match(spec, /hostname === "127\.0\.0\.1" \|\| hostname === "localhost"/);
  assert.match(spec, /route\.abort\(\)/);
  assert.match(spec, /expect\(blocked, blocked\.join\("\\n"\)\)\.toEqual\(\[\]\)/);
  assert.match(spec, /enabled: false, attempted: 0/);
  assert.match(spec, /\/v1\/tenants\/\$\{E2E_TENANT\}\/supervised-actions/);
  assert.match(spec, /status: "approved"/);
  const correctAt = spec.indexOf('name: "Correct"');
  const approveAt = spec.indexOf('name: "Approve"');
  assert.ok(correctAt > -1 && approveAt > correctAt, "Correct must precede Approve");
  const firstReload = spec.indexOf("page.reload()");
  const secondReload = spec.indexOf("page.reload()", firstReload + 1);
  assert.ok(firstReload > correctAt && firstReload < approveAt);
  assert.ok(secondReload > approveAt);
});
