import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, "..");
const pythonCandidates = [
  process.env.E2E_PYTHON,
  path.join(repoRoot, "backend/.venv/bin/python"),
].filter((item): item is string => Boolean(item));
const python = pythonCandidates.find((item) => existsSync(item)) ?? "python3";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Worker E2E requires DATABASE_URL for loopback sioona_migration_test");
  }
  if (
    parsed.protocol !== "postgresql+psycopg:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname !== "/sioona_migration_test" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Worker E2E refuses any database other than loopback sioona_migration_test");
  }
  return url;
}

const ownerUrl = databaseUrl();
const runtimeUrl = ownerUrl.replace("://sioona@", "://sioona_runtime@").replace("://sioona:", "://sioona_runtime:");
const actorKey = "e2e-actor-key-at-least-32-bytes!!";
const authSecret = "e2e-only-auth-secret";
const serviceToken = "e2e-only-token";
const pilotUsers = JSON.stringify([
  { email: "e2e@example.com", password: "e2e-only-password", tenantId: "tenant_e2e", role: "admin" },
]);

function env(overrides: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && key !== "DATABASE_URL") base[key] = value;
  }
  return { ...base, ...overrides, NEXT_TELEMETRY_DISABLED: "1", DETECT_LLM: "0", GROQ_API_KEY: "" };
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "worker-upload.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `bash -s <<'E2E'
set -euo pipefail
"${python}" -c "import sitecustomize; sitecustomize.require_guard(); import runpy; runpy.run_module('uvicorn', run_name='__main__')" app.main:app --host 127.0.0.1 --port 8000 &
api_pid=$!
DATABASE_URL=${JSON.stringify(runtimeUrl)} "${python}" -c "import sitecustomize; sitecustomize.require_guard(); import runpy; runpy.run_module('app.worker', run_name='__main__')" &
worker_pid=$!
cleanup() { kill "$api_pid" "$worker_pid" 2>/dev/null || true; }
trap cleanup EXIT TERM INT
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$worker_pid" 2>/dev/null; do sleep 1; done
exit 1
E2E`,
      cwd: path.join(repoRoot, "backend"),
      url: "http://127.0.0.1:8000/health",
      timeout: 60_000,
      reuseExistingServer: false,
      env: env({
        DATABASE_URL: ownerUrl,
        PYTHONPATH: path.join(webRoot, "e2e/guards"),
        CB02_OUTBOUND_AUDIT: process.env.CB02_OUTBOUND_AUDIT ?? "/tmp/cb11-worker-e2e-audit",
        SIOONA_SERVICE_TOKEN: serviceToken,
        SIOONA_ENV: "development",
        SIOONA_DETECTION_EXECUTION: "worker",
        SIOONA_WORKER_PAUSE: "0",
        SIOONA_WORKER_TENANTS: "tenant_e2e",
        SIOONA_ACTOR_AUTH: "off",
        SIOONA_ACTOR_KEY: actorKey,
      }),
    },
    {
      command: "./node_modules/.bin/next dev --turbopack --hostname 127.0.0.1 --port 3000",
      cwd: webRoot,
      url: "http://127.0.0.1:3000/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: env({
        BACKEND_URL: "http://127.0.0.1:8000",
        SIOONA_SERVICE_TOKEN: serviceToken,
        AUTH_SECRET: authSecret,
        SIOONA_STATE_MODE: "postgres",
        SIOONA_DETECTION_EXECUTION: "worker",
        SIOONA_ACTOR_AUTH: "off",
        SIOONA_ACTOR_KEY: actorKey,
        SIOONA_PILOT_USERS: pilotUsers,
        SIOONA_ADMIN_EMAIL: "e2e@example.com",
        SIOONA_ADMIN_PASSWORD: "e2e-only-password",
        SIOONA_TENANT_ID: "tenant_e2e",
      }),
    },
  ],
});
