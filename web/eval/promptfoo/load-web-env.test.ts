import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWebEnvFiles, parseEnvFile } from "./load-web-env.mjs";

function writeEnv(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

describe("parseEnvFile", () => {
  it("strips quotes, skips comments, and keeps last assignment", () => {
    expect(
      parseEnvFile(
        [
          "# comment",
          "",
          "GROQ_API_KEY=plain",
          'DETECT_LLM_MODEL="qwen/qwen3.8-27b"',
          "export GROQ_API_KEY='from-env'",
        ].join("\n")
      )
    ).toEqual({
      GROQ_API_KEY: "from-env",
      DETECT_LLM_MODEL: "qwen/qwen3.8-27b",
    });
  });
});

describe("loadWebEnvFiles", () => {
  it("lets a blank .env value lose to .env.local", () => {
    const dir = mkdtempSync(join(tmpdir(), "sioona-load-web-env-"));
    const envFile = writeEnv(dir, ".env", "GROQ_API_KEY=\nDETECT_LLM_MODEL=from-env\n");
    const localFile = writeEnv(
      dir,
      ".env.local",
      "GROQ_API_KEY=from-local\nDETECT_LLM_MODEL=from-local\n"
    );

    const env: Record<string, string> = {};
    loadWebEnvFiles([envFile, localFile], env);

    expect(env.GROQ_API_KEY).toBe("from-local");
    expect(env.DETECT_LLM_MODEL).toBe("from-local");
    expect(env.GROQ_API_KEY.trim()).not.toBe("");
  });

  it("lets .env.local override .env (Next.js file precedence)", () => {
    const dir = mkdtempSync(join(tmpdir(), "sioona-load-web-env-"));
    const envFile = writeEnv(dir, ".env", "GROQ_API_KEY=from-env\nDETECT_LLM_MODEL=from-env\n");
    const localFile = writeEnv(
      dir,
      ".env.local",
      "GROQ_API_KEY=from-local\nDETECT_LLM=1\n"
    );

    const env: Record<string, string> = {};
    loadWebEnvFiles([envFile, localFile], env);

    expect(env.GROQ_API_KEY).toBe("from-local");
    expect(env.DETECT_LLM_MODEL).toBe("from-env");
    expect(env.DETECT_LLM).toBe("1");
  });

  it("does not let skip-if-present make .env win over .env.local", () => {
    const dir = mkdtempSync(join(tmpdir(), "sioona-load-web-env-"));
    const envFile = writeEnv(dir, ".env", "GROQ_API_KEY=from-env\n");
    const localFile = writeEnv(dir, ".env.local", "GROQ_API_KEY=from-local\n");

    const env: Record<string, string> = {};
    loadWebEnvFiles([envFile, localFile], env);

    expect(env.GROQ_API_KEY).toBe("from-local");
  });

  it("never overwrites keys already present on the process env", () => {
    const dir = mkdtempSync(join(tmpdir(), "sioona-load-web-env-"));
    const envFile = writeEnv(dir, ".env", "GROQ_API_KEY=from-env\nOTHER=from-env\n");
    const localFile = writeEnv(dir, ".env.local", "GROQ_API_KEY=from-local\nOTHER=from-local\n");

    const env: Record<string, string> = { GROQ_API_KEY: "from-shell" };
    loadWebEnvFiles([envFile, localFile], env);

    expect(env.GROQ_API_KEY).toBe("from-shell");
    expect(env.OTHER).toBe("from-local");
  });

  it("skips missing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "sioona-load-web-env-"));
    const localFile = writeEnv(dir, ".env.local", "GROQ_API_KEY=from-local\n");

    const env: Record<string, string> = {};
    loadWebEnvFiles([join(dir, ".env"), localFile], env);

    expect(env.GROQ_API_KEY).toBe("from-local");
  });
});
