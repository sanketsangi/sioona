import { defineConfig, devices } from "@playwright/test";

/**
 * Live-demo smoke. Default target is production.
 * Override with SMOKE_BASE_URL (no trailing slash).
 *
 * Does not start a local server — this suite is for the hosted demo.
 */
const baseURL = (
  process.env.SMOKE_BASE_URL ?? "https://sioona-demo.vercel.app"
).replace(/\/$/, "");

/** Use installed Google Chrome when Playwright's Chromium download is blocked. */
const channel =
  process.env.SMOKE_CHANNEL === "chrome" ? ("chrome" as const) : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.smoke.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel },
    },
  ],
});
