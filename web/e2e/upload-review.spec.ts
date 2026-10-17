import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { expect, test, type Page, type Response } from "@playwright/test";

import { ingestPublicationError } from "./ingest-publication.mjs";

/** Keep in sync with playwright.config.ts. Not a production credential. */
const E2E_EMAIL = "e2e@example.com";
const E2E_PASSWORD = "e2e-only-password";
const E2E_TENANT = "tenant_e2e";
const E2E_SERVICE_TOKEN = "e2e-only-token";

const REHEARSAL_CSV = path.resolve(
  process.cwd(),
  "data/samples/pilot/independent-rehearsal/rehearsal_week_1.csv",
);

const NOT_SENT = "Approved — not sent. Run it in your tools; Sioona never CRM-tags.";

/** Fail the test on every non-localhost request. */
async function failClosedOutbound(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    let hostname = "";
    try {
      hostname = new URL(requestUrl).hostname;
    } catch {
      blocked.push(`${route.request().method()} ${requestUrl}`);
      await route.abort();
      return;
    }
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
      return;
    }
    const method = route.request().method();
    blocked.push(`${method} ${requestUrl}`);
    await route.abort();
  });
  return blocked;
}

async function dismissNotifications(page: Page) {
  const trigger = page.locator('button[aria-label^="Notifications"]');
  if ((await trigger.getAttribute("data-state")) !== "open") return;
  await page.keyboard.press("Escape");
  if ((await trigger.getAttribute("data-state")) === "open") {
    await page.mouse.click(520, 680);
  }
  await expect(trigger).toHaveAttribute("data-state", "closed", { timeout: 5_000 });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(E2E_EMAIL);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

function ingestResponse(response: Response): boolean {
  return (
    response.url().includes("/api/ingest") &&
    response.request().method() === "POST"
  );
}

test("upload rehearsal week, persist Correct and an approved draft, send nothing", async ({
  page,
}) => {
  const blocked = await failClosedOutbound(page);
  await signIn(page);
  await page.goto("/?view=upload");
  await page.locator("#chat-export").setInputFiles(REHEARSAL_CSV);

  const firstIngest = page.waitForResponse(ingestResponse, { timeout: 120_000 });
  await page.getByRole("button", { name: "Upload & Detect" }).click();
  const replace = page.getByRole("button", { name: "Confirm Replace", exact: true });
  if (await replace.isVisible()) await replace.click();
  let response = await firstIngest;
  if (response.status() === 409) {
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("partner_demo_replace_confirm_required");
    const confirmed = page.waitForResponse(ingestResponse, { timeout: 120_000 });
    await page.getByRole("button", { name: "Confirm Replace" }).click();
    response = await confirmed;
  }

  const raw = await response.text();
  expect(response.ok(), raw).toBeTruthy();
  const uploaded = JSON.parse(raw) as {
    newSignals?: number;
    detectLlm?: { enabled?: boolean; attempted?: number };
    predictionSync?: { failed?: number };
    conversationSync?: { failed?: number };
    syncError?: string;
  };
  expect(ingestPublicationError(response.status(), uploaded), raw).toBeNull();
  expect(uploaded.detectLlm).toEqual(
    expect.objectContaining({ enabled: false, attempted: 0 }),
  );
  expect(uploaded.newSignals ?? 0).toBeGreaterThan(0);
  await page.waitForURL(/[?&]view=insights/);

  await expect(page.getByRole("menu")).toHaveCount(0);

  const approval = page.getByRole("link", { name: /Open approval for / }).first();
  await expect(approval).toBeVisible();
  await approval.click();
  await dismissNotifications(page);
  const why = page.locator('[data-review-slot="why"]');
  await expect.poll(async () =>
    why.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.height > 0 ? (el.textContent ?? "") : "";
    }),
  ).toContain("Supporting evidence");
  await expect.poll(async () => why.evaluate((el) => el.textContent ?? "")).toMatch(
    /close my account/,
  );

  const previewId = new URL(page.url()).searchParams.get("preview");
  const file = new URL(page.url()).searchParams.get("file");
  expect(previewId).toBeTruthy();

  await dismissNotifications(page);
  const feedback = page.getByRole("group", { name: "Feedback actions" });
  const saved = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/feedback") &&
      res.ok(),
  );
  await feedback.getByRole("button", { name: "Correct", exact: true }).click();
  await saved;
  await page.waitForURL(url => url.searchParams.get("preview") !== previewId);

  const fileQuery = file ? `&file=${encodeURIComponent(file)}` : "";
  const reviewed = `/?view=insights&status=followup&preview=${previewId}${fileQuery}`;
  await page.goto(reviewed);
  await page.reload();
  const reviewedFeedback = page.getByRole("group", { name: "Feedback actions" });
  await expect(reviewedFeedback.getByRole("button", { name: "Correct", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await dismissNotifications(page);
  const draft = page.locator('[data-review-slot="retention-email"]');
  const decided = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/action") &&
      res.ok(),
  );
  await draft.getByRole("button", { name: "Approve" }).click();
  const decidedResponse = await decided;
  const decidedBody = (await decidedResponse.json()) as {
    action?: { conversationId?: string };
    sent?: boolean;
  };
  expect(decidedBody.sent).toBe(false);
  const conversationId = decidedBody.action?.conversationId ?? "";
  expect(conversationId).not.toBe("");
  const required = { action_type: "retention_email_draft", status: "approved" } as const;
  const stored = await page.request.get(
    `http://127.0.0.1:${process.env.SIOONA_E2E_BACKEND_PORT || 8000}/v1/tenants/${E2E_TENANT}/supervised-actions?conversation_id=${encodeURIComponent(conversationId)}`,
    {
      headers: {
        Authorization: `Bearer ${E2E_SERVICE_TOKEN}`,
        "X-Tenant-Id": E2E_TENANT,
      },
    },
  );
  const storedText = await stored.text();
  expect(stored.ok(), storedText).toBeTruthy();
  const rows = JSON.parse(storedText) as Array<{
    conversation_id?: string;
    action_type?: string;
    status?: string;
  }>;
  expect(
    rows.some(
      (row) =>
        row.conversation_id === conversationId &&
        row.action_type === required.action_type &&
        row.status === required.status,
    ),
  ).toBe(true);
  await expect(page.locator("p.text-pretty").filter({hasText:NOT_SENT})).toBeVisible();
  await page.reload();
  await expect(page.locator("p.text-pretty").filter({hasText:NOT_SENT})).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Feedback actions" }).getByRole("button", { name: "Correct", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  expect(blocked, blocked.join("\n")).toEqual([]);
});

test("reconstruct persisted approval and feedback in canonical mode", async ({ page }) => {
  test.skip(process.env.SIOONA_STATE_MODE !== "postgres", "Canonical Postgres rehearsal only");
  const blocked = await failClosedOutbound(page);
  await signIn(page);
  const response = await page.request.get(`http://127.0.0.1:${process.env.SIOONA_E2E_BACKEND_PORT || 8000}/v1/tenants/${E2E_TENANT}/signals`, {
    headers: { Authorization: `Bearer ${E2E_SERVICE_TOKEN}`, "X-Tenant-Id": E2E_TENANT },
  });
  expect(response.ok()).toBeTruthy();
  const signals = await response.json();
  const signal = signals.find((row: { signal_type: string; acted?: boolean; feedback?: { feedback: string } }) =>
    row.signal_type === "retention" && row.feedback?.feedback === "correct" && !row.acted);
  expect(signal).toBeTruthy();
  await page.goto(`/?view=insights&status=followup&preview=${encodeURIComponent(`sig_neon_${signal.id}`)}`);
  await expect(page.locator("p.text-pretty").filter({hasText:NOT_SENT})).toBeVisible();
  await expect(page.getByRole("group", { name: "Feedback actions" })
    .getByRole("button", { name: "Correct", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(blocked).toEqual([]);
  if (process.env.CB10_E2E_DATA_PATH_FILE) {
    const server = JSON.parse(fs.readFileSync(process.env.CB10_E2E_DATA_PATH_FILE, "utf8"));
    expect(fs.readdirSync(server.dataDir).filter(name => /^store.*\.json$/.test(name))).toEqual([]);
    if (process.env.CB10_E2E_PREVIOUS_SERVER) {
      const previous = JSON.parse(fs.readFileSync(process.env.CB10_E2E_PREVIOUS_SERVER, "utf8"));
      expect(server.pid).not.toBe(previous.pid);
      expect(server.dataDir).not.toBe(previous.dataDir);
      expect(fs.existsSync(previous.dataDir)).toBe(false);
    }
  }
});


test("canonical read outage recovers persisted state through Retry", async ({ page }) => {
  test.skip(process.env.SIOONA_STATE_MODE !== "postgres", "Canonical Postgres rehearsal only");
  const blocked = await failClosedOutbound(page);
  await signIn(page);
  const python = fs.existsSync(path.resolve("../backend/.venv/bin/python"))
    ? path.resolve("../backend/.venv/bin/python") : "python3";
  const renamePilot = (unavailable: boolean) => execFileSync(python, ["-c", `
import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
url = make_url(os.environ["DATABASE_URL"])
assert url.host in ("127.0.0.1", "localhost", "::1") and url.database == "sioona_migration_test" and not url.query, "Refusing non-test database"
engine = create_engine(url)
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE ${unavailable ? "pilot_settings RENAME TO cb10_pilot_settings_unavailable" : "cb10_pilot_settings_unavailable RENAME TO pilot_settings"}"))
engine.dispose()
`], { env: process.env, stdio: "pipe" });
  await page.setViewportSize({ width: 390, height: 844 });
  renamePilot(true);
  let unavailable = true;
  try {
    await page.goto("/?view=insights");
    await expect(page.getByRole("heading", { name: "Insights Could Not Be Loaded" })).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry the request" });
    expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    renamePilot(false);
    unavailable = false;
    await retry.click();
    await expect(page.getByRole("heading", { name: "Insights Could Not Be Loaded" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open approval for / }).first()).toBeVisible();
    expect(blocked).toEqual([]);
  } finally {
    if (unavailable) renamePilot(false);
  }
});
