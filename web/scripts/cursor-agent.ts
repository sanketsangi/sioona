/**
 * One-shot local Cursor agent against this checkout.
 *
 *   cd web && npm run agent -- "Summarize how Signal Score is fetched"
 *
 * Reads CURSOR_API_KEY from the shell, then web/.env and web/.env.local
 * (shell wins). Exit 1 if the run never starts; exit 2 if it starts and fails.
 */

import path from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import { loadWebEnvFiles } from "../eval/promptfoo/load-web-env.mjs";

loadWebEnvFiles([
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.local"),
]);

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('usage: npm run agent -- "<prompt>"');
  process.exit(1);
}

const apiKey = process.env.CURSOR_API_KEY?.trim();
if (!apiKey) {
  console.error("CURSOR_API_KEY is not set");
  process.exit(1);
}

async function main() {
  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2.5" },
      local: {
        cwd: process.cwd(),
        settingSources: ["project"],
      },
    });

    if (result.status === "error") {
      console.error(result.error?.message ?? result.id);
      process.exit(2);
    }

    console.log(result.result ?? "");
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(`${err.message} retryable=${err.isRetryable}`);
      process.exit(1);
    }
    throw err;
  }
}

void main();
