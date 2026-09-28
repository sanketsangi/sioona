#!/usr/bin/env node
/** Offline assertion smoke test — no Groq network call. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evalDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(evalDir, "../..");
const nvmNode = join(
  process.env.NVM_DIR ?? join(process.env.HOME ?? "", ".nvm"),
  "versions/node/v22.22.0/bin"
);

function nodeBin() {
  const candidate = join(nvmNode, "node");
  return existsSync(candidate) ? candidate : "node";
}

const node = nodeBin();
const npx = join(dirname(node), "npx");

spawnSync(npx, ["tsx", "eval/promptfoo/sync-system-prompt.ts"], {
  cwd: webRoot,
  stdio: "inherit",
});

const result = spawnSync(
  npx,
  [
    "promptfoo",
    "eval",
    "-c",
    "promptfooconfig.yaml",
    "--providers",
    "file://smoke-provider.mjs",
    "--no-cache",
    ...process.argv.slice(2),
  ],
  { cwd: evalDir, stdio: "inherit", env: process.env }
);

process.exit(result.status ?? 1);
