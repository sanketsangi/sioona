/**
 * Writes the live Detect v2 classifier system prompt to disk for Promptfoo.
 * Keeps eval aligned with `SYSTEM_PROMPT` in detect-llm.ts without duplication.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SYSTEM_PROMPT } from "../../src/lib/detect-llm";

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, "system-prompt.txt"), SYSTEM_PROMPT, "utf8");
console.log(`Synced system prompt (${SYSTEM_PROMPT.length} chars) → eval/promptfoo/system-prompt.txt`);
