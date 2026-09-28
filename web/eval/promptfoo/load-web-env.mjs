import { existsSync, readFileSync } from "node:fs";

/**
 * Parse a dotenv file body into a key/value map (last assignment wins).
 * Quotes around values are stripped; comments and blank lines are skipped.
 */
export function parseEnvFile(source) {
  const vars = {};
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

/**
 * Apply dotenv files with Next.js precedence:
 * existing `env` keys (shell / process) > later files > earlier files.
 *
 * Snapshot keys already on `env` first so `.env.local` can replace `.env`
 * without being blocked by skip-if-present, and without clobbering the
 * real process environment. The runner passes this merged env to Promptfoo
 * and does not pass `--env-file`: Promptfoo 0.123 reloads those flags with
 * dotenv `override: true`, which would replace shell values this merge kept.
 */
export function loadWebEnvFiles(paths, env = process.env) {
  const protectedKeys = new Set(Object.keys(env));
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const parsed = parseEnvFile(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (protectedKeys.has(key)) continue;
      env[key] = value;
    }
  }
  return env;
}
