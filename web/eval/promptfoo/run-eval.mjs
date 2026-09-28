#!/usr/bin/env node
/**
 * Run Sioona signal-detection Promptfoo evals.
 * Requires Node >= 22.22 (Promptfoo) and GROQ_API_KEY in web/.env or .env.local.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const evalDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(evalDir, "../..");
const nvmNode = join(
  process.env.NVM_DIR ?? join(process.env.HOME ?? "", ".nvm"),
  "versions/node/v22.22.0/bin"
);

function nodeBin() {
  const candidate = join(nvmNode, "node");
  if (existsSync(candidate)) return candidate;
  return "node";
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: webRoot,
    env: process.env,
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const node = nodeBin();
const npx = join(dirname(node), "npx");

const version = spawnSync(node, ["--version"], { cwd: webRoot, encoding: "utf8" });
const semver = version.stdout.trim().replace(/^v/, "").split(".").map(Number);
const required = [22, 22, 0];
let belowRequired = false;
for (let i = 0; i < required.length; i++) {
  const have = semver[i] ?? 0;
  const need = required[i];
  if (have > need) break;
  if (have < need) {
    belowRequired = true;
    break;
  }
}
if (belowRequired) {
  console.error(
    `\nPromptfoo requires Node.js >= 22.22.0 (detected ${version.stdout.trim()}).\n` +
      "Install Node 22.22+ (e.g. nvm install 22.22.0) and re-run npm run eval.\n"
  );
  process.exit(1);
}

for (const name of [".env", ".env.local"]) {
  loadEnvFile(join(webRoot, name));
}

if (!process.env.GROQ_API_KEY?.trim()) {
  console.error(
    "\nGROQ_API_KEY is not set. Add it to web/.env or web/.env.local (see .env.example).\n"
  );
  process.exit(1);
}

run(npx, ["tsx", "eval/promptfoo/sync-system-prompt.ts"]);

const envFiles = [".env", ".env.local"].filter((f) => existsSync(join(webRoot, f)));
const promptfooArgs = [
  "promptfoo",
  "eval",
  "-c",
  "promptfooconfig.yaml",
  "--no-cache",
  ...envFiles.flatMap((f) => ["--env-file", join(webRoot, f)]),
  ...process.argv.slice(2),
];

run(npx, promptfooArgs, { cwd: evalDir });
