import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

describe("Vercel Ignored Build Step script", () => {
  const scriptPath = resolve(__dirname, "../../scripts/ignore-build.sh");
  const siteScriptPath = resolve(__dirname, "../../../site/scripts/ignore-build.sh");

  const runScript = (targetPath: string, env: Record<string, string | undefined>) => {
    return spawnSync("bash", [targetPath], {
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
    });
  };

  it("proceeds with build (exit code 1) on production main branch", () => {
    const res = runScript(scriptPath, { VERCEL_GIT_COMMIT_REF: "main", VERCEL_ENV: undefined });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("Production build detected");
  });

  it("proceeds with build (exit code 1) when VERCEL_GIT_COMMIT_REF is refs/heads/main", () => {
    const res = runScript(scriptPath, { VERCEL_GIT_COMMIT_REF: "refs/heads/main", VERCEL_ENV: undefined });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("Production build detected");
  });

  it("proceeds with build (exit code 1) when VERCEL_ENV is production", () => {
    const res = runScript(scriptPath, { VERCEL_GIT_COMMIT_REF: undefined, VERCEL_ENV: "production" });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("Production build detected");
  });

  it("skips build (exit code 0) on feature PR branch to preserve Hobby tier quota", () => {
    const res = runScript(scriptPath, {
      VERCEL_GIT_COMMIT_REF: "cb/CB-13-routing-benchmark",
      VERCEL_ENV: "preview",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Preview build for branch 'cb/CB-13-routing-benchmark' skipped");
  });

  it("skips build (exit code 0) on arbitrary PR branch", () => {
    const res = runScript(scriptPath, {
      VERCEL_GIT_COMMIT_REF: "feat/some-pr-branch",
      VERCEL_ENV: "preview",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Preview build for branch 'feat/some-pr-branch' skipped");
  });

  it("site script behaves identically to web script", () => {
    const prodRes = runScript(siteScriptPath, { VERCEL_GIT_COMMIT_REF: "main", VERCEL_ENV: undefined });
    expect(prodRes.status).toBe(1);

    const prevRes = runScript(siteScriptPath, {
      VERCEL_GIT_COMMIT_REF: "cb/CB-13-routing-benchmark",
      VERCEL_ENV: "preview",
    });
    expect(prevRes.status).toBe(0);
  });
});
