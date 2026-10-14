import { expect, test, type Page, type Response } from "@playwright/test";

/** Synthetic pilot login. Not a production credential. */
const EMAIL = "e2e@example.com";
const PASSWORD = "e2e-only-password";

const CSV = [
  "conversation_id,role,content,channel,timestamp",
  "queued-001,customer,I want to close my account and cancel the service.,upload,2026-10-14T09:00:00Z",
].join("\n");

async function failClosedOutbound(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    let hostname = "";
    try {
      hostname = new URL(requestUrl).hostname;
    } catch {
      await route.abort();
      return;
    }
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
      return;
    }
    await route.abort();
  });
}

function ingestResponse(response: Response): boolean {
  return response.url().includes("/api/ingest") && response.request().method() === "POST";
}

test("signed-in worker upload opens Insights only after the job succeeds", async ({ page }) => {
  await failClosedOutbound(page);
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto("/?view=upload");
  await page.locator("#chat-export").setInputFiles({
    name: "queued-week.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });

  const posted = page.waitForResponse(ingestResponse, { timeout: 120_000 });
  await page.getByRole("button", { name: "Upload & Detect" }).click();
  const ingest = await posted;
  const raw = await ingest.text();
  expect(ingest.status(), raw).toBe(202);
  const accepted = JSON.parse(raw) as { job_id?: string; accepted?: number };
  expect(accepted.job_id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(accepted.accepted).toBeGreaterThan(0);
  await expect(page).not.toHaveURL(/[?&]view=insights/);
  await expect(page.getByRole("paragraph").filter({ hasText: "Upload accepted. Detection pending" })).toBeVisible();

  const jobId = accepted.job_id ?? "";
  const succeeded = page.waitForResponse(async (response) => {
    if (!response.url().includes(`/api/jobs/${jobId}`) || !response.ok()) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "succeeded";
  }, { timeout: 90_000 });
  await succeeded;
  await page.waitForURL(/[?&]view=insights/);
  const landed = new URL(page.url());
  expect(landed.searchParams.get("view")).toBe("insights");
  expect(landed.searchParams.get("imported")).toBe("1");
  expect(landed.searchParams.get("file")).toBe("queued-week.csv");
  expect(landed.searchParams.get("signals")).toBeNull();
  await expect(page.getByRole("link", { name: "queued-week.csv" }).first()).toBeVisible();
  await expect(page.getByText("Is at high churn risk — intervene today.").first()).toBeVisible();
});
