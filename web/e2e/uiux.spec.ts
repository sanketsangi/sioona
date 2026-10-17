import { createHmac } from "node:crypto";
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
  await expect(page.getByRole("status", { name: "Upload complete", exact: true })).toBeVisible();
  await capture(page, "upload-complete");
  await page.getByRole("link", { name: "Review signals →", exact: true }).click();
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
  // No Navigation API: capture popstate before Next unmounts the editor.
  await page.evaluate(() => {
    Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
    history.pushState(history.state, "", `${location.href}&draft-check=1`);
  });
  page.once("dialog", prompt => prompt.dismiss());
  await page.evaluate(() => history.back());
  await expect.poll(() => new URL(page.url()).searchParams.get("draft-check")).toBe("1");
  await expect(body).toHaveValue(revised);
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


test("queue pagination preserves URL state and restores keyboard focus after review", async ({page}) => {
  await signIn(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?view=insights&status=all&file=rehearsal_week_1.csv");
  const next = page.getByRole("link", { name: "Go to next page", exact: true });
  await expect(next).toBeVisible();
  await next.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(url => url.searchParams.get("page") === "2");
  expect(new URL(page.url()).searchParams.get("file")).toBe("rehearsal_week_1.csv");
  const row = page.locator("a[data-queue-row-link]:visible").first();
  expect(await page.locator("[data-queue-row]:visible").count()).toBeLessThanOrEqual(10);
  const href = await row.getAttribute("href");
  await row.focus(); await page.keyboard.press("Enter");
  await page.waitForURL(url => Boolean(url.searchParams.get("preview")));
  await page.goBack();
  await page.waitForURL(url => !url.searchParams.has("preview"));
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe(href);
  for (const [width,height] of [[390,844],[1280,800],[2880,1600]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) {
      const previous = page.getByRole("link", {name:"Go to previous page",exact:true});
      expect((await previous.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});


test("pilot intake validates, protects edits and retries an uncertain durable receipt", async ({page}) => {
  await signIn(page);
  await page.getByRole("link", {name:"Request a pilot",exact:true}).first().click();
  await page.getByRole("button", {name:"Request a pilot",exact:true}).click();
  await expect(page.getByLabel("Name (required)", {exact:true})).toBeFocused();
  await page.getByLabel("Name (required)", {exact:true}).fill("Synthetic Operator");
  await page.getByLabel("Work email (required)").fill(`synthetic-${Date.now()}@example.com`);
  await page.getByLabel("Company (required)").fill("Synthetic pilot fixture");
  page.once("dialog",dialog=>dialog.dismiss());
  await page.getByRole("link", {name:"Back to pilot checklist"}).click();
  await expect(page).toHaveURL(/pilot-request/);
  const keys:string[]=[];let uncertain=true;
  await page.route("**/api/pilot-requests", async route=>{
    keys.push(route.request().headers()["idempotency-key"]);
    if(uncertain) {uncertain=false;const response=await route.fetch();expect(response.ok()).toBe(true);await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({ok:false})});}
    else await route.continue();
  });
  await page.getByRole("button", {name:"Request a pilot",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Retry safely");
  await page.getByRole("button", {name:"Request a pilot",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Pilot request received"})).toBeVisible();
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  await expect(page.getByRole("status")).toContainText(keys[0]);
  await capture(page,"pilot-request-receipt");
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("link",{name:"Request a pilot",exact:true}).click();
  await expect(page.getByRole("form",{name:"Request a pilot"})).toBeVisible();
});

test("known partial upload recovery polls the existing job without resubmitting",async({page})=>{
 await signIn(page);let mutations=0;page.on("request",r=>{if(r.method()==="POST" && /\/api\/(ingest|detect)/.test(r.url())) mutations++;});
 await page.route("**/api/jobs/synthetic-recovery",route=>route.fulfill({json:{status:"dead_lettered",job_id:"synthetic-recovery",completed_conversations:2,conversation_count:5,attempt_count:3,max_attempts:3,signal_count:null}}));
 await page.goto("/?view=upload&uploadJob=synthetic-recovery&uploadFile=synthetic.csv");
 await page.getByRole("button",{name:"Resume checking upload"}).click();
 const recovery=page.getByRole("region",{name:"Upload recovery status"});await expect(recovery).toContainText("2 of 5");await expect(recovery).toContainText("3 not yet published");await expect(recovery).toContainText("Do not re-upload");
 await page.getByRole("button",{name:"Resume checking upload"}).click();expect(mutations).toBe(0);await expect(page).toHaveURL(/uploadJob=synthetic-recovery/);
 await capture(page,"upload-recovery");
});

test("guided pilot, scoped report evidence and PDF completion survive reload",async({page})=>{
 await signIn(page);
 await page.goto("/?view=upload");await page.locator("#chat-export").setInputFiles(path.resolve("data/samples/pilot/independent-rehearsal/rehearsal_week_1.csv"));
 await page.getByRole("button",{name:"Upload & Detect",exact:true}).click();
 if(await page.getByRole("button",{name:"Confirm Replace",exact:true}).isVisible()) await page.getByRole("button",{name:"Confirm Replace",exact:true}).click();
 await expect(page.getByRole("status",{name:"Upload complete",exact:true})).toBeVisible();
 await page.goto("/?view=report&file=rehearsal_week_1.csv&scoreFrom=2026-01-01&scoreTo=2026-12-31");
 await expect(page.getByText("Simulated data and outcomes",{exact:false}).first()).toBeVisible();
 const select=page.getByLabel("Upload corpus");const upload=await select.locator("option").evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value).find(Boolean));expect(upload).toBeTruthy();await select.selectOption(upload!);await page.getByRole("button",{name:"Apply upload"}).click();
 const reportURL=page.url();const reportParams=new URL(reportURL).searchParams;
 await page.getByRole("link",{name:"Inspect signal and evidence"}).first().click();
 await expect(page.getByRole("heading",{name:"Upload evidence review"})).toBeVisible();expect(new URL(page.url()).searchParams.get("uploadId")).toBe(reportParams.get("uploadId"));expect(new URL(page.url()).searchParams.get("scoreTo")).toBe(reportParams.get("scoreTo"));
 await page.getByRole("link",{name:"Back to scoped revenue report"}).click();
 const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Prepare executive PDF"}).click();const download=await downloadPromise;expect(await download.failure()).toBeNull();
 await expect(page.getByText("4. Executive PDF · Complete")).toBeVisible();await page.reload();await expect(page.getByText("4. Executive PDF · Complete")).toBeVisible();
 const pilotLink=page.getByRole("link",{name:"Guided pilot",exact:true});await pilotLink.click();await expect(page.getByRole("heading",{name:"Guided pilot checklist"})).toBeVisible();expect(new URL(page.url()).searchParams.get("uploadId")).toBe(reportParams.get("uploadId"));
 await capture(page,"guided-pilot");
 await page.goto("/readiness");await expect(page.getByRole("heading",{name:"Operator readiness",exact:true})).toBeVisible();await expect(page.getByText("Live backend revision and schema: unavailable",{exact:false})).toBeVisible();await capture(page,"operator-readiness");
});


test("denied demo loading stays visible and never starts a second destructive request",async({page,context})=>{
 const payload=Buffer.from(JSON.stringify({email:"e2e@example.com",tenantId:"tenant_demo",role:"admin",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
 const signature=createHmac("sha256","e2e-only-auth-secret").update(payload).digest("base64url");
 await context.addCookies([{name:"sioona_session",value:`${payload}.${signature}`,url:test.info().project.use.baseURL as string}]);
 let posts=0;
 await page.route("**/api/store",route=>{if(route.request().method()==="POST"){posts++;return route.fulfill({status:401,json:{error:"Sign in required."}});}return route.continue();});
 await page.goto("/?view=insights&file=Groww_batch_02");
 await expect(page.getByRole("alert").filter({hasText:"Sign in as an admin"})).toBeVisible();
 await expect(page.getByRole("link",{name:"Sign in to load this demo"})).toHaveAttribute("href","/login");
 await expect(page.getByRole("button",{name:"Retry loading demo"})).toHaveCount(0);
 expect(posts).toBe(1);
 await page.getByRole("link",{name:"Open uploads",exact:true}).click();
 await expect(page).toHaveURL(/[?&]view=upload/);expect(posts).toBe(1);
});
