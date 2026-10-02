#!/usr/bin/env node
/**
 * Run Sioona signal-detection Promptfoo evals.
 * Requires Node >= 22.22 (Promptfoo) and GROQ_API_KEY in web/.env or .env.local.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebEnvFiles } from "./load-web-env.mjs";

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

const envFiles = [".env", ".env.local"]
  .map((name) => join(webRoot, name))
  .filter((path) => existsSync(path));
// Next.js order: .env then .env.local (local wins). Shell keys stay put.
// Do not pass these paths as Promptfoo `--env-file`: that loader overrides
// process.env, so a value already exported in the shell would lose to the files.
loadWebEnvFiles(envFiles);

if (!process.env.GROQ_API_KEY?.trim()) {
  console.error(
    "\nGROQ_API_KEY is not set. Add it to web/.env or web/.env.local (see .env.example).\n"
  );
  process.exit(1);
}

run(npx, ["tsx", "eval/promptfoo/sync-system-prompt.ts"]);

// ~1k prompt tokens/call. 12s between starts stays under free-tier 7000 ITPM
// while evaluateOptions.maxConcurrency stays 2.
process.env.SIOONA_EVAL_GAP_MS ??= "12000";

const extra = process.argv.slice(2);
const hasConfig = extra.some(
  (arg) => arg === "-c" || arg === "--config" || arg.startsWith("--config=")
);
const promptfooArgs = [
  "promptfoo",
  "eval",
  ...(hasConfig ? [] : ["-c", "promptfooconfig.yaml"]),
  "--no-cache",
  ...extra,
];

run(npx, promptfooArgs, { cwd: evalDir });
