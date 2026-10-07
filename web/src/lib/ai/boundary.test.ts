import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROVIDERS = path.join(SRC, "lib", "ai", "providers") + path.sep;
const HOSTS = /api\.groq\.com|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

describe("model provider boundary", () => {
  it("only ai/providers references provider hosts", () => {
    const offenders = [...sources(SRC)].filter(
      (file) => !file.startsWith(PROVIDERS) && HOSTS.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
