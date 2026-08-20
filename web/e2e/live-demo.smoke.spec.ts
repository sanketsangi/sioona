import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * Public hosted-demo smoke. Do not click Run Partner Demo — that wipes Neon.
 */

const CRASH_TEXT = [
  /Unhandled Runtime Error/i,
  /Application error:/i,
  /This page could not load/i,
];

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

async function isAuthGate(page: Page, response: Response | null) {
  const status = response?.status() ?? 0;
  if (status === 401 || status === 403) return `HTTP ${status}`;
  const authHeading = page.getByRole("heading", {
    name: /authentication required/i,
  });
  if (await authHeading.isVisible().catch(() => false)) {
    return "Vercel Authentication page";
  }
  return null;
}

async function assertNoCrash(page: Page, errors: string[]) {
  // `nextjs-portal` is always present in `next dev` (indicator). Fail only on the error dialog.
  await expect(
    page.locator("[data-nextjs-dialog], [data-nextjs-dialog-overlay]")
  ).toHaveCount(0);
  for (const pattern of CRASH_TEXT) {
    await expect(page.getByText(pattern)).toHaveCount(0);
  }
  expect(errors, errors.join("\n")).toEqual([]);
}

test.describe("live demo smoke", () => {
  test("home / demo page loads (HTTP 200, main UI visible)", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    const auth = await isAuthGate(page, response);
    if (auth) {
      test.skip(true, `auth-gated (${auth}) — public pages only`);
    }

    expect(
      response?.ok(),
      `expected HTTP 200, got ${response?.status()} ${response?.url()}`
    ).toBeTruthy();

    await expect(page.locator("#main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: /insights/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sioona" })).toBeVisible();
    await assertNoCrash(page, errors);
  });

  test("Partner Demo CTA is reachable on Upload", async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto("/?view=upload", {
      waitUntil: "domcontentloaded",
    });
    const auth = await isAuthGate(page, response);
    if (auth) {
      test.skip(true, `auth-gated (${auth}) — public pages only`);
    }

    expect(
      response?.ok(),
      `expected HTTP 200, got ${response?.status()} ${response?.url()}`
    ).toBeTruthy();

    await expect(
      page.getByRole("heading", { level: 1, name: /upload chats/i })
    ).toBeVisible();
    const cta = page.getByRole("button", { name: "Run Partner Demo" });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
    await assertNoCrash(page, errors);
  });

  test("Insights route loads", async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto("/?view=insights", {
      waitUntil: "domcontentloaded",
    });
    const auth = await isAuthGate(page, response);
    if (auth) {
      test.skip(true, `auth-gated (${auth}) — public pages only`);
    }

    expect(
      response?.ok(),
      `expected HTTP 200, got ${response?.status()} ${response?.url()}`
    ).toBeTruthy();

    await expect(page.locator("#main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: /insights/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Insights" }).first()).toBeVisible();
    await assertNoCrash(page, errors);
  });
});
