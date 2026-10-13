import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

if (!process.env.CB02_OUTBOUND_AUDIT) {
  throw new Error("Run CB-02 through npm run e2e so server outbound attempts fail the gate");
}
const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, "..");
const venvPython = path.join(repoRoot, "backend/.venv/bin/python");
const python = existsSync(venvPython) ? venvPython : "python3";

const TEST_DATABASE_URL =
  "postgresql+psycopg://sioona:ci_only@127.0.0.1:5432/sioona_migration_test";

/** Synthetic values. Not a production credential. Keep in sync with the spec. */
const E2E_TOKEN = "e2e-only-token";
const E2E_AUTH_SECRET = "e2e-only-auth-secret";
const E2E_EMAIL = "e2e@example.com";
const E2E_PASSWORD = "e2e-only-password";
const E2E_TENANT = "tenant_e2e";

function e2eDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  const url = fromEnv ? fromEnv : TEST_DATABASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("CB-02 E2E requires a local disposable PostgreSQL URL");
  }
  if (
    parsed.protocol !== "postgresql+psycopg:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname !== "/sioona_migration_test" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "CB-02 E2E requires loopback sioona_migration_test without query or fragment",
    );
  }
  return url;
}

function childEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  // Playwright merges this object over the parent environment.
  return {
    ...env,
    ...overrides,
    NEXT_TELEMETRY_DISABLED: "1",
    SIOONA_IDENTITY_KEY: "cb02-synthetic-identity-key-not-for-production",
    DETECT_LLM: "0",
    GROQ_API_KEY: "",
    SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
    SENTRY_AUTH_TOKEN: "",
    SIOONA_PILOT_USERS: JSON.stringify([
      {
        email: E2E_EMAIL,
        password: E2E_PASSWORD,
        tenantId: E2E_TENANT,
        role: "admin",
      },
    ]),
  };
}

/**
 * Next writes store.json into cwd/data. Copy the app so this run does not
 * replace web/data/store*.json. Turbopack rejects a symlinked project root.
 */
const isolateAndStart = [
  "set -euo pipefail",
  'ROOT="$(pwd)"',
  'WORK="$(mktemp -d "${TMPDIR:-/tmp}/sioona-e2e-web.XXXXXX")"',
  'cleanup() { if [ -n "${server_pid:-}" ]; then kill "$server_pid" 2>/dev/null || true; fi; rm -rf "$WORK"; }',
  "trap cleanup EXIT TERM INT",
  "rsync -a --exclude /node_modules --exclude /.next --exclude /data --exclude /test-results --exclude /playwright-report --exclude '/.env' --exclude '/.env.*' \"$ROOT/\" \"$WORK/\"",
  'mkdir -p "$WORK/data"',
  'ln -s "$ROOT/data/samples" "$WORK/data/samples"',
  'ln -s "$ROOT/node_modules" "$WORK/node_modules"',
  'cd "$WORK"',
  "./node_modules/.bin/next build --webpack",
  "./node_modules/.bin/next start --hostname 127.0.0.1 --port 3000 &",
  "server_pid=$!",
  "if [ -n \"${CB10_E2E_DATA_PATH_FILE:-}\" ]; then printf '{\"dataDir\":\"%s\",\"pid\":%s}\\n' \"$WORK/data\" \"$server_pid\" > \"$CB10_E2E_DATA_PATH_FILE\"; fi",
  'wait "$server_pid"',
].join("\n");

const databaseUrl = e2eDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "upload-review.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 60_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: [
    {
      command: `"${python}" -c "import sitecustomize; sitecustomize.require_guard(); import runpy; runpy.run_module('uvicorn', run_name='__main__')" app.main:app --host 127.0.0.1 --port 8000`,
      cwd: path.join(repoRoot, "backend"),
      url: "http://127.0.0.1:8000/health",
      timeout: 60_000,
      reuseExistingServer: false,
      env: childEnv({
        DATABASE_URL: databaseUrl,
        SIOONA_SERVICE_TOKEN: E2E_TOKEN,
        SIOONA_ENV: "development",
      }),
    },
    {
      command: `bash -s <<'E2E'\n${isolateAndStart}\nE2E`,
      cwd: webRoot,
      url: "http://127.0.0.1:3000/login",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 300_000,
      reuseExistingServer: false,
      env: childEnv({
        BACKEND_URL: "http://127.0.0.1:8000",
        SIOONA_SERVICE_TOKEN: E2E_TOKEN,
        AUTH_SECRET: E2E_AUTH_SECRET,
        SIOONA_ADMIN_EMAIL: E2E_EMAIL,
        SIOONA_ADMIN_PASSWORD: E2E_PASSWORD,
        SIOONA_TENANT_ID: E2E_TENANT,
      }),
    },
  ],
});
