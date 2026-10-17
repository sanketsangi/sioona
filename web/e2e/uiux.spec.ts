import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
const shots = () => test.info().outputPath("uiux");
async function signIn(page: Page) {
  fs.mkdirSync(shots(), {recursive:true});
  await page.route("**/*", route => {
    if (!["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)) throw new Error("Unexpected non-local browser request");
    return route.continue();
  });
  await page.goto("/login");
  await page.getByLabel("Email", {exact:true}).fill("e2e@example.com");
  await page.getByLabel("Password", {exact:true}).fill("e2e-only-password");
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  await page.waitForURL(url => url.pathname !== "/login");
}
async function capture(page: Page, name: string, widths = [["desktop",1440,900],["laptop",1280,800],["tablet",820,1180],["mobile",390,844]] as const) {
  for (const [label,width,height] of widths) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (name === "review" && label === "mobile") {
      const correct = await page.getByRole("button", {name:"Correct",exact:true}).boundingBox();
      expect(correct!.height).toBeGreaterThanOrEqual(44);
      expect(await page.locator('[data-review-slot="why"] button').first().evaluate(el => {
        const quote = Array.from(el.querySelectorAll("span")).find(span => span.childElementCount === 0 && span.textContent?.startsWith("“"));
        return quote != null && quote.scrollWidth <= quote.clientWidth + 1;
      })).toBe(true);
    }
    await page.screenshot({path:`${shots()}/${name}-${label}.png`});
  }
}
test("evidence, draft failure recovery, approval separation, handling and URL context", async ({page}) => {
  await signIn(page);
  const timings: { path: string; durationMs: number; status?: number }[] = [];
  page.on("requestfinished", async request => {
    if (request.method() === "POST" && /\/api\/signals\//.test(request.url())) {
      const response = await request.response();
      timings.push({ path: new URL(request.url()).pathname.replace(/\/signals\/[^/]+/, "/signals/[id]"), durationMs: Math.round(request.timing().responseEnd), status: response?.status() });
    }
  });
  await page.goto("/?view=upload");
  await page.locator("#chat-export").setInputFiles(path.resolve("data/samples/pilot/independent-rehearsal/rehearsal_week_1.csv"));
  await page.getByRole("button", {name:"Upload & Detect",exact:true}).click();
  if (await page.getByRole("button", {name:"Confirm Replace",exact:true}).isVisible()) await page.getByRole("button", {name:"Confirm Replace",exact:true}).click();
  await page.waitForURL(/[?&]view=insights/);
  await expect(page.getByRole("menu")).toHaveCount(0);
  const locked = page.getByRole("radio", {name:"Action Mode is locked for now"});
  if (await locked.count()) { await locked.press("Space"); await expect(locked).toHaveAttribute("aria-checked","false"); }
  await page.getByRole("link", {name:/Open approval for /}).first().click();
  await page.waitForURL(url => Boolean(url.searchParams.get("preview")));
  const reviewUrl = page.url();
  const signalId = new URL(reviewUrl).searchParams.get("preview");
  const evidence = page.locator('[data-review-slot="why"]').getByRole("button", {name:/Show in conversation:/}).first();
  const sourceBox = await page.locator('[data-review-slot="why"]').boundingBox();
  const draftBox = await page.locator('[data-review-slot="actions"]').boundingBox();
  expect(sourceBox!.y).toBeLessThan(draftBox!.y);
  await evidence.click();
  await expect(page.locator('[data-evidence-match="true"]').first()).toBeVisible();
  await capture(page,"review");
  await evidence.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(evidence).toBeFocused();
  await page.setViewportSize({width:1440,height:900});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.getByRole("button", {name:"Edit Draft",exact:true}).click();
  const dialog = page.getByRole("dialog");
  const body = dialog.getByLabel("Body",{exact:true});
  const revised = "Synthetic revised draft — नमस्ते. Please tell us how we can help.";
  await body.fill("");
  await dialog.getByRole("button", {name:"Save draft",exact:true}).click();
  await expect(body).toBeFocused({timeout:2000});
  await body.fill(revised);
  await page.route("**/api/signals/*/action", route => route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Temporarily unavailable. Try again."})}));
  await dialog.getByRole("button", {name:"Save draft",exact:true}).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(body).toHaveValue(revised);
  page.once("dialog", prompt => prompt.dismiss());
  await dialog.getByRole("button", {name:"Cancel",exact:true}).click();
  await expect(body).toHaveValue(revised);
  await page.unroute("**/api/signals/*/action");
  await body.press("Control+Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Correct",exact:true})).toHaveAttribute("aria-pressed","false");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable:true, value:{ writeText: async (text: string) => {
      document.documentElement.dataset.syntheticClipboard = text;
    } } });
  });
  await page.getByRole("button", {name:"Copy reply to clipboard",exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("data-synthetic-clipboard", revised);
  await expect(page.getByRole("button",{name:"Correct",exact:true})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"Approve draft",exact:true}).click();
  await expect(page.locator("p.text-pretty").filter({hasText:"Approved — not sent. Run it in your tools; Sioona never CRM-tags."})).toBeVisible();
  await expect(page.getByRole("button",{name:"Correct",exact:true})).toHaveAttribute("aria-pressed","false");
  await expect(page.getByText(/Update Feedback to Correct to unlock Mark as acted/)).toBeVisible();
  const feedbackSaved = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/feedback") && response.ok());
  await page.getByRole("button",{name:"Correct",exact:true}).click();
  await feedbackSaved;
  await page.waitForURL(url => url.searchParams.get("preview") !== signalId);
  await page.goto(reviewUrl);
  await expect(page.getByRole("button",{name:"Correct",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("link",{name:"Evaluation",exact:true}).click();
  await page.waitForURL(url => url.searchParams.get("view") === "eval");
  expect(new URL(page.url()).searchParams.get("preview")).toBe(signalId);
  expect(new URL(page.url()).searchParams.get("file")).toBe(new URL(reviewUrl).searchParams.get("file"));
  await page.goBack();
  await page.waitForURL(url => url.searchParams.get("view") === "insights" && url.searchParams.get("preview") === signalId);
  await expect(page.getByRole("button",{name:"Mark as acted",exact:true})).toBeVisible();
  const handlingSaved = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/acted") && response.ok());
  await page.getByRole("button",{name:"Mark as acted",exact:true}).click();
  await handlingSaved;
  await expect.poll(async () => new URL(page.url()).searchParams.get("preview") !== signalId ||
    await page.locator('[data-review-slot="actions"]').getByRole("button", {name:"Marked as Acted",exact:true}).isVisible()).toBe(true);
  await page.goto(reviewUrl);
  await expect(page.locator('[data-review-slot="actions"]').getByRole("button", {name:"Marked as Acted",exact:true})).toBeDisabled();
  fs.writeFileSync(`${shots()}/mutation-timings.json`, JSON.stringify(timings, null, 2));
});
test("known upload reconnects without reingest and retains an actionable error", async ({page}) => {
  await signIn(page);
  let posts=0;
  page.on("request", request => { if(request.method()==="POST" && request.url().includes("/api/ingest")) posts++; });
  await page.route("**/api/jobs/uiux_job", route => route.fulfill({status:503,body:"Unavailable"}));
  await page.goto("/?view=upload&uploadJob=uiux_job&uploadFile=synthetic.csv");
  await page.getByRole("button",{name:"Resume checking upload",exact:true}).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Progress connection lost");
  expect(posts).toBe(0);
  await page.getByRole("link",{name:"Evaluation",exact:true}).click();
  await page.waitForURL(url => url.searchParams.get("view") === "eval");
  await page.getByRole("link",{name:"Uploads",exact:true}).click();
  await page.waitForURL(url => url.searchParams.get("view") === "upload");
  await expect(page.getByRole("button",{name:"Resume checking upload",exact:true})).toBeVisible();
  await capture(page,"upload-recovery");
});
test("specialist screens and filtered empty recovery at desktop and phone widths", async ({page}) => {
  await signIn(page);
  for (const [name,url] of [["evaluation","/?view=eval"],["taxonomy","/?view=taxonomy"],["report","/?view=report"],["economics","/economics"],["lifecycle","/lifecycle"],["filtered-empty","/?view=insights&q=zzzz-no-synthetic-match&type=lead"]]) {
    await page.goto(url); await expect(page.locator("#main")).toBeVisible(); await capture(page,name);
  }
  await expect(page.getByRole("link",{name:"Clear filters",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Clear filters",exact:true}).click();
  await page.waitForURL(url => !url.searchParams.has("q"));
});

test("keyboard entry, upload inspection and zoom layout stress", async ({page, context}) => {
  await page.goto("/login");
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  await expect(page.getByLabel("Email", {exact:true})).toBeFocused();
  await expect(page.locator("form").getByRole("alert")).toContainText("Enter email and password");
  await signIn(page);
  await page.goto("/?view=upload");
  await page.locator("#chat-export").setInputFiles(path.resolve("data/samples/pilot/independent-rehearsal/rehearsal_week_1.csv"));
  await page.getByRole("button", {name:"Preview mapping",exact:true}).click();
  await expect(page.getByText(/Nothing imported; choose Upload & Detect/)).toBeVisible();
  const contrast = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const probe = document.createElement("span");
    document.body.append(probe);
    const luminance = (token: string) => {
      probe.style.color = `var(${token})`;
      ctx.fillStyle = getComputedStyle(probe).color;
      ctx.fillRect(0, 0, 1, 1);
      const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const result = Object.fromEntries(["--sio-bg-base", "--sio-bg-muted"].flatMap(surface => {
      const background = luminance(surface);
      return ["--sio-fg-base", "--sio-fg-subtle", "--sio-fg-muted"].map(token => {
        const foreground = luminance(token);
        return [`${token} on ${surface}`, (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)];
      });
    }));
    probe.remove();
    return result;
  });
  fs.writeFileSync(`${shots()}/text-contrast.json`, JSON.stringify(contrast, null, 2));
  for (const ratio of Object.values(contrast)) expect(ratio).toBeGreaterThanOrEqual(4.5);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", {rate:4});
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {offline:false,latency:100,downloadThroughput:200000,uploadThroughput:100000});
  await page.setViewportSize({width:720,height:450});
  await page.screenshot({path:`${shots()}/upload-200-percent-effective-width.png`});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({width:2880,height:1800});
  await page.evaluate(() => { document.documentElement.style.zoom = "0.5"; });
  await page.screenshot({path:`${shots()}/upload-ultrawide-css-50-percent.png`});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await cdp.detach();
});
