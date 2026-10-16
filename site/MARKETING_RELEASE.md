# sioona.si local launch rehearsal — 16 October 2026

**Local production-mode verification passed; hosted cutover remains NO-GO.** The intended marketing origin is `https://sioona.si` and the optional product origin is `https://app.sioona.si`. “Signal Intelligence” is the `.si` brand meaning for this rehearsal. No DNS, hosting configuration, mail records or deployments were changed.

See [the SEO task record](../docs/development/tasks/SEO-SETUP.md) for the authorized release status and live acceptance receipts. The separate local readiness audit was excluded from this scoped release. Verification passed: lint/token guard, typecheck, 92 tests in 25 files, the requested webpack build, 24 production smoke groups and 34 Chromium browser groups. The temporary loopback server was stopped after verification.

Every public route now has route-specific canonical and `en-IN`, `en-US`, `en`, `x-default` alternate links; Open Graph uses `en_US` with `en_IN` alternate. Organization and Service declare India/US service areas and stable canonical entity IDs; Organization declares Signal Intelligence/Conversation Intelligence topics. These signals do not change Google's classification of the `.si` ccTLD or guarantee country rankings. All locales currently share the same English page.

The build used the user-supplied `pilot@sioona.si`, `30 days for pilot intake records` and `ap-south-1` as local fixture inputs. They are not verified hosted policy/mailbox/region facts. Domain DNS checks failed from this machine; TLS, email authentication, Search Console, real intake configuration and authorized hosted receipt/readback remain acceptance gates. Do not deploy the local fixture artifact without approving the real values. Earlier counts, environment examples and deployment choices below are historical context.

# Same-day launch verification — 14 October 2026

**Local implementation verified; production launch NO-GO until the hosted gates below pass.**

Branch: `feat/site-is-agentic`. Navigation/focus fixes and the initial report were committed as `6f5ac428` above `46795bd` by another process. The publishing follow-up integrates the latest `origin/main`, removes already-committed `.agents/teamwork` artifacts from the PR diff, and supplies explicit non-secret Marketing site CI fixtures. A local recovery archive for the removed artifacts is retained at `.cache/launch-qa/teamwork-before-pr.tar`; the earlier recovery stash is also retained. No unrelated working-tree source is included. The user authorized committing, pushing, opening the PR and merging after all CI jobs pass; deployment, DNS/firewall changes and external pilot submissions remain outside this authorization.

Verification is on the clean publishing commit using the synthetic inputs documented below. CI fixture values are only for validation; they must never be used as production launch facts. Production GO remains gated on live custom-domain smoke checks and an explicitly authorized durable pilot receipt/readback.

## Hero preview playback follow-up — 14 October 2026

At the user's request, the hero demo now plays automatically when visible in the viewport. The control defaults to Pause; pausing keeps the demo stopped until resumed. Offscreen and background-tab timer suspension and reduced-motion static rendering remain supported.

## Dropdown hover playback follow-up — 14 October 2026

At the user's request, all four Product dropdown previews now play when the menu opens or another item is hovered/focused. The control defaults to Pause; pausing keeps the selected preview stopped until resumed or another item is selected. The header's “Illustrative demo” text was removed. The dropdown-only score gauge and bars now animate through CSS transforms with a real pause state, rather than repeatedly remounting a static chart. Reduced motion and hidden-tab suspension remain supported.

Verified locally: lint/token guard, 87 Vitest tests, typecheck, production build with the existing synthetic QA inputs, and diff whitespace check passed. Browser verification confirmed the four preview selections, moving score gauge, advancing feature sequence, Pause/Play, and removed label. These follow-up changes are uncommitted and supersede only the earlier dropdown paused-by-default behavior; they do not change production GO gates.

## Implemented

- Strict centralized site/app origin parsing: `NEXT_PUBLIC_SITE_URL` has precedence for an explicit HTTPS custom domain. Until cutover, Render's built-in `RENDER_EXTERNAL_URL` is accepted only when it is exactly `https://sioona-site.onrender.com`; the legacy approved `https://sioona-site.vercel.app` origin remains valid. Localhost, loopback, unapproved platform domains, credentials, path/query/hash and missing canonical input fail closed. Sign in stays omitted when the optional app origin is unset.
- Four security headers and the complete Accept/Origin/Next-router Vary list across HTML, Markdown, native discovery/protocol endpoints and errors. Next 16 proxy convention, standalone output, and a warning-free standalone `npm start` launcher that copies public/static assets.
- Explicit index/follow metadata, default social previews, a 180×180 Apple icon, preserved JSON-LD schemas with escaped script serialization, deterministic sitemap revisions/priorities including `/llms.txt`, and explicit search/AI crawler rules. Sitemap dates record verified Git content revisions, rather than request/build time; update them when publishing later substantive content revisions.
- Shared substantive marketing prose, developer documentation, pilot/evidence/Signal Score facts, and privacy/terms copy for human pages and Markdown/MCP. `llms.txt` includes the same pilot/security/policy information. Synthetic demo transcripts are excluded from agent content. Approved public policy is snapshotted at build time; startup rejects different public origins or policy values, so changing them requires a rebuild. `NEXT_PUBLIC_CONTACT_POLICY` is generated internally from the three public facts by Next configuration; it is not another operator input and contains no credentials.
- Contact JSON/origin checks, bot honeypot rejection, 16 KB streamed body cap, existing field bounds, stable retry identity, 10 s upstream and 12 s browser timeouts, strict matching stored receipt, validated upstream Retry-After, preserved fields, and support-mailbox recovery. No third-party webhook or secondary persistence was added.
- Hero playback plays when visible in the viewport and pauses offscreen or in a hidden tab. Product dropdown playback follows the hover behavior documented above. Offscreen/hidden-tab/reduced-motion guards remain. Explicit WebKit drawer focus restoration and document-level product-menu Escape handling cover pointer interactions that leave focus outside the menu. Navigation prefetch defaults off to avoid background request cancellation warnings and POST-only endpoint prefetch; callers can explicitly opt in.

## Exact local verification evidence

From `site/`, final checks returned exit 0:

```text
npm run lint
> eslint src scripts next.config.ts && node scripts/check-tokens.mjs
check-tokens: ok

node scripts/check-tokens.mjs
check-tokens: ok

npm test
 Test Files  25 passed (25)
      Tests  85 passed (85)

npm run typecheck
> tsc --noEmit

npm run build
✓ Compiled successfully in 798ms
  Finished TypeScript in 1681ms
✓ Generating static pages using 7 workers (20/20) in 415ms

git diff --check -- .
(no output)
```

The build used **synthetic QA inputs**, not approved launch facts. The existing `.env.local` was not edited. This artifact must be rebuilt before production deployment:

```sh
NEXT_PUBLIC_SITE_URL=https://launch.example.test NEXT_PUBLIC_APP_URL= \
PILOT_CONTACT_SUPPORT_EMAIL=launch@example.test \
PILOT_CONTACT_RETENTION='Synthetic verification policy only' \
PILOT_CONTACT_HOSTING_REGION=synthetic-test-region npm run build
```

Standalone server was verified with the same synthetic environment, `HOSTNAME=127.0.0.1 PORT=3197 npm start`. The Node launcher emitted no standalone/middleware warning.

```sh
NEXT_PUBLIC_SITE_URL=https://launch.example.test \
node scripts/verify-production.mjs http://127.0.0.1:3197
```

Exact smoke output:

```text
PASS /: HTTP, landmarks, title, description, canonical
PASS /about: HTTP, landmarks, title, description, canonical
PASS /how-it-works: HTTP, landmarks, title, description, canonical
PASS /security: HTTP, landmarks, title, description, canonical
PASS /pricing: HTTP, landmarks, title, description, canonical
PASS /contact: HTTP, landmarks, title, description, canonical
PASS /developers: HTTP, landmarks, title, description, canonical
PASS /privacy: HTTP, landmarks, title, description, canonical
PASS /terms: HTTP, landmarks, title, description, canonical
PASS internal anchors, structured data, user-controlled demo, 17 assets, crawl files, social image, 404
PASS /: HTML/Markdown negotiation, status and Vary
PASS /about: HTML/Markdown negotiation, status and Vary
PASS /how-it-works: HTML/Markdown negotiation, status and Vary
PASS /security: HTML/Markdown negotiation, status and Vary
PASS /pricing: HTML/Markdown negotiation, status and Vary
PASS /contact: HTML/Markdown negotiation, status and Vary
PASS /developers: HTML/Markdown negotiation, status and Vary
PASS /privacy: HTML/Markdown negotiation, status and Vary
PASS /terms: HTML/Markdown negotiation, status and Vary
PASS /agentic-missing-page: HTML/Markdown negotiation, status and Vary
PASS business declaration, Organization, agent instructions, MCP discovery + live handshake + public tool calls
PASS Sioona branding, initialized notification, scanner CORS and preflight
PASS exact canonical origin, all security headers and complete Vary tokens; no contact POST sent
```

Browser automation: **68 checks passed**, Chromium and WebKit 26.5; all 9 public routes at 375×667, 1440×900 and 2560×1440, no horizontal document overflow or heading-level jumps. Explicit playback, offscreen pause, menu Escape/focus restoration, reduced-motion and no-JavaScript home/workflow checks passed. Captured console/page errors: **0**. Contact POST attempts: **0**. Unit coverage additionally verifies hidden-tab timer suspension and mocked intake receipt/failure/retry behavior.

Local Chromium home measurement with 4× CPU slowdown, 150 ms network latency, 200,000 bytes/s download and 100,000 bytes/s upload: FCP 0.856 s, LCP 2.120 s, CLS 0. This is a single local run, not a hosted Lighthouse score, field measurement or physical Safari/iOS Low Power Mode certification. Ignored local evidence is under `.cache/launch-qa/` (browser report, screenshots, smoke output and the executable QA script). Browser tooling came from the bundled workspace runtime; no application dependency was added.

## Same-day deployment checklist

1. Set Vercel Project Root Directory to `site` and use a supported Node LTS runtime. Set the inputs below with real approved values; never deploy the synthetic QA build. Leave `NEXT_PUBLIC_APP_URL` unset for this launch.

   - `NEXT_PUBLIC_SITE_URL`: exact canonical HTTPS origin, with no path/query/hash. Set it for the custom domain; it strictly overrides Render's built-in URL. If it is unset on Render, the site accepts only `RENDER_EXTERNAL_URL=https://sioona-site.onrender.com`. The legacy `https://sioona-site.vercel.app` origin remains accepted; temporary platform deployment and branch hostnames remain invalid.
   - `PILOT_INTAKE_BACKEND_URL`: production FastAPI base URL. Required at runtime for accepting pilot requests; the handler appends `/v1/pilot-requests`.
   - `SIOONA_SERVICE_TOKEN`: matching server-only FastAPI bearer token. Required at runtime; never expose it through a public environment variable.
   - `PILOT_CONTACT_SUPPORT_EMAIL`: approved, actively monitored mailbox. Optional; leave unset to direct visitors to the contact form.
   - `PILOT_CONTACT_RETENTION`: approved public wording for contact records. Optional; leave unset to state that a standard retention period is not published yet.
   - `PILOT_CONTACT_HOSTING_REGION`: actual pilot-request database region. Required at build and runtime.
   - `NEXT_PUBLIC_APP_URL`: optional HTTPS product origin; leave unset so Sign in is hidden.

   Rebuild after changing the canonical/app origin or any public policy value. Contact-record policies do not replace separately agreed customer-export processing terms.

2. Use the approved canonical origin configured on Render's `sioona-site` service. `https://sioona-site.vercel.app` remains an approved marketing origin until that hostname is retired. For a custom domain, add it to the Render service, update `NEXT_PUBLIC_SITE_URL`, rebuild, and verify DNS, redirects and TLS before treating it as canonical.

3. Verify FastAPI contact rate enforcement on the deployed intake path. Any separately approved edge rule should match method `POST`, exact path `/api/contact`, a **600-second** window and **10** requests per client IP with action **429**. Verify behavior without customer data; do not assume a Vercel firewall protects the Render service. No hosted rule or paid configuration is changed by this checklist.

4. Deploy the rebuilt artifact and immediately run:

```sh
cd /Users/sanket/Documents/Sioona/site
node scripts/verify-production.mjs https://YOUR-CANONICAL-DOMAIN --production
```

Replace the placeholder with the actual canonical origin. The script accepts explicit HTTPS custom domains, `https://sioona-site.onrender.com`, and `https://sioona-site.vercel.app`; it rejects temporary Render/Vercel and localhost production targets. It checks canonical/OG/JSON-LD/robots/sitemap origins, all security/Vary headers, assets, Markdown 200/404 negotiation, discovery and stateless read-only MCP protocol calls. It sends **zero POST `/api/contact` requests**.

5. Recheck the live pages at the three viewport sizes and in the target browsers. Separately obtain explicit authorization for one synthetic pilot request; require its matching durable receipt, read back the row using the operator's `backend/scripts/lookup_pilot_request.py` workflow, confirm the expected fields and idempotent retry behavior, and confirm a human actively monitors the support mailbox and intake queue. Backend files/infrastructure were not edited or exercised here.

**Remaining external blockers:** actual canonical domain and DNS/TLS, approved policy values, production backend/token configuration, active firewall/backend rate enforcement, live-domain smoke/browser evidence, monitored support mailbox, and authorized persisted receipt/readback. Declare GO only when all of these have evidence.

## Render deployment (proposed unified hosting)

The repository-root `render.yaml` proposes `sioona-site` alongside the product
web service, API, paused detection worker, and ingestion recovery cron.
Applying the Blueprint is a separately approved hosted action. Review adoption
of the existing API and the worker's CB-10/D9 gates before syncing it.

Use a **Node web service**, Root Directory `site`, Node 22, build command
`npm ci && npm run build`, and start command `npm start`. The start script
packages static/public assets into the standalone output. `HOSTNAME=0.0.0.0`
lets Render reach the server, and Render supplies `PORT`. Automatic deployment
is disabled in the proposal so releases remain operator controlled.

Supply the inputs from the same-day checklist through Render's
`sync: false` placeholders: `NEXT_PUBLIC_SITE_URL`,
`PILOT_INTAKE_BACKEND_URL`, `SIOONA_SERVICE_TOKEN`,
`PILOT_CONTACT_SUPPORT_EMAIL`, `PILOT_CONTACT_RETENTION`, and
`PILOT_CONTACT_HOSTING_REGION`. Use approved policy facts and the actual
marketing HTTPS origin; rebuild after changes to public values. Keep the token
server-only and matching the API. `NEXT_PUBLIC_APP_URL` remains optional; leave
it unset until the product origin is approved. Never deploy synthetic QA values.

Configure DNS, TLS, and canonical redirects for the approved Render domain.
For a root custom domain at DNS providers without ALIAS/ANAME flattening, set
`A @ 216.24.57.1`; set `CNAME www sioona-site.onrender.com` for `www` (and use
the service's `onrender.com` hostname for any other subdomain). Remove conflicting
`AAAA` records, add the root or `www` domain to the service in Render, verify it,
and wait for Render-managed TLS. Choose one canonical hostname in Render: adding
the root makes Render add and redirect `www` to the root, while adding `www`
makes Render add and redirect the root to `www`. Set `NEXT_PUBLIC_SITE_URL` to
that exact canonical HTTPS origin, rebuild, then verify the alternate hostname
redirects permanently to it before optionally disabling the Render subdomain.
Vercel firewall rules do not apply on Render: verify backend abuse controls and
any approved edge rate controls before opening contact intake. Run
`node scripts/verify-production.mjs https://YOUR-CANONICAL-DOMAIN --production`
and repeat viewport/browser checks after deployment. This smoke test does not
submit contact requests. The separately authorized synthetic receipt/readback,
monitored mailbox, and all remaining external blockers above still gate GO.
See [Render's Blueprint specification](https://render.com/docs/blueprint-spec)
and [`../web/DEPLOY.md`](../web/DEPLOY.md) for the product/API configuration.

## Standalone Node/Docker hosting

`npm run build` produces `.next/standalone/server.js`. `npm start` copies `public/` and `.next/static/` into that output and launches it without `next start` warnings. For a minimal container artifact, copy those directories at image build time:

```sh
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js
```

Supply the same real mandatory runtime values used for the production build. Terminate TLS at your hosting proxy and configure the canonical-domain redirect there. Verify the backend's abuse controls; a Vercel firewall rule does not protect standalone Node hosting.

---

The sections below are historical records; the verification and deployment conditions above supersede their playback, environment and test-count statements.

# Marketing design review — 10 October 2026

Branch: `codex/marketing-market-ready`. Base: `b432400`.

## Review and implementation

Reviewed the live home page at https://sioona-site.vercel.app/ against the local route structure, shared styles, navigation, product demonstrations, contact form and intake handler.

- Replaced the generic hero with a centered editorial composition, a teal accent, clear pilot benefits and a framed product workspace.
- Removed the live site's placeholder customer-logo strip. Named export sources accurately describe the existing upload workflow without implying endorsements or live integrations.
- Replaced blurred, scroll-dependent problem copy with readable server-rendered content and a semantic heading.
- Applied shared canvas, panel, typography, control and focus tokens across home, pricing, security, workflow and contact pages.
- Kept product demonstrations illustrative. The hero demo starts paused with a complete frame and includes a screen-reader explanation.
- Added a generated 1200 × 630 social preview and large Twitter card. The canonical fallback now uses the supplied production domain instead of localhost. Set NEXT_PUBLIC_SITE_URL when using another production domain.

## Verification

- `npm run lint`: passed, including design-token guard.
- `npm run typecheck`: passed.
- `npm test`: 10 existing tests passed (bounded JSON and contact API).
- `npm run build`: passed with the default Turbopack build; all five marketing routes and the social image prerendered successfully. The initial sandboxed build stalled; stopping that task's process and running with process permissions resolved it.
- Browser: home inspected at 390, 1280 and 1440 pixels; no horizontal document overflow at those widths. Pricing, security and how-it-works rendered with correct titles/headings and no document overflow at inspected desktop widths.
- Browser: mobile menu opens, Escape closes it and focus returns to its trigger. Empty contact submission marks the three required inputs invalid and focuses Name.

## Release conditions still requiring hosted evidence

The code is build-ready. Production intake and full production performance are not certified by local checks.

1. Verify production PILOT_INTAKE_BACKEND_URL and SIOONA_SERVICE_TOKEN are configured server-side; the existing API returns 503 without them. Confirm a separately authorized synthetic submission persists and returns its matching receipt. No external submission was made during this task.
2. Confirm the team monitors stored requests and has an approved privacy notice for collecting contact information. This change does not invent privacy or contractual promises.
3. Verify the deployed canonical domain, social image, mobile pages and intake recovery behavior. Run production Lighthouse and Safari/reduced-motion checks before declaring a broad market launch; no measured performance or accessibility score is claimed here.

The redesign is committed on `codex/marketing-market-ready`. No merge or deployment was performed. Hosted intake verification remains outstanding.

## Existing-design polish — 12 October 2026

Branch: `codex/website-design-polish`. Base: `90625f2`.
The discarded `codex/website-design-revamp` branch was deleted at the user's request. All tracked and new task files are inside `site/`; the pre-existing `.cursor/permissions.json` remains untouched.

The original hero, product workspace, teal accent, export overview, signal cards, scroll workflow, score, feature grid, security section, FAQ and closing CTA are preserved. This pass refines hierarchy, spacing, button proportions, card radii, layered depth and narrow-screen layout. Inspiration came from the product-first presentation of Linear and Fin, without importing their assets or adding unsupported customer claims.

Behavior improvements:

- The illustrative hero starts with a complete, paused frame and labels its synthetic data. Playback is user-controlled; its timer stops when paused, offscreen, or reduced motion is requested. Controls use inline SVG icons and accurate accessible playback state.
- FAQ panels follow the URL hash, including hydration, Back/Forward and close. Buttons remain labelled and linked to their regions.
- Reduced-motion users receive a compact workflow with all step descriptions, instead of a long scroll sequence. Clicking a step updates its illustration directly.
- Signal quotes and FAQ answers remain readable without JavaScript. The illustrative score renders 84% immediately instead of depending on a count-up effect. The score gauge and bars retain static no-JavaScript fallbacks.
- The homepage has a focused title and description, canonical URL, Open Graph/Twitter metadata and SoftwareApplication structured data. Existing FAQ structured data, sitemap and robots routes remain intact.
- The unresolved jsdom 29 dependency was replaced with published jsdom 27.0.1, including its lockfile, so navigation tests run reproducibly. Use a supported Node LTS runtime for CI/deployment; the local Node 23 runtime emitted an ESLint dependency engine warning during install.

Verified on the final production build:

- `npm test`: 21 tests across 6 files passed. New regressions cover paused playback, timer cleanup, reduced-motion playback, FAQ deep links/history and labelled panels. Existing navigation, bounded input and mocked intake tests also pass.
- `npm run lint`: passed with no warnings, including the design-token guard.
- `npm run typecheck`, `git diff --check`, and `npm run build`: passed. All marketing routes and crawl/share assets built successfully.
- `node scripts/verify-production.mjs http://127.0.0.1:3101`: passed. Checks five routes, one H1/main per page, SEO metadata, internal anchor targets, schema, 16 static assets, sitemap/robots/social image and a real 404 response. This is a local, read-only check.
- Browser: document width matches viewport at 320, 390, 768, 1440 and 2560 pixels. Desktop/mobile screenshots were inspected. Product dropdown opens and Escape closes it with focus restored. Mobile dialog closes on Escape and restores focus to Open Menu. Demo play/pause and FAQ keyboard/history interactions pass, with no captured browser errors or warnings.
- Contact form: empty submission shows three invalid fields, announces the error count and focuses Name. No request was sent to an external intake service.
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities. The full audit reports 12 development-tool advisories (3 moderate, 7 high, 2 critical); these remain unresolved. Do not treat the production-only audit as a clean audit of the build/test toolchain.

Local preview: http://127.0.0.1:3101/ . No commit, push, merge or deployment was performed.

Deployment readiness limits: the optimized build is ready for a deployment review, but hosted intake configuration and durable receipt, deployed canonical URL, production performance with CPU/network throttling, Safari/iOS Low Power Mode, and an actual browser reduced-motion/no-JavaScript run have not been certified. Timer tests and CSS/static-render fallbacks provide local coverage for those modes; they do not replace device testing. Complete hosted intake verification through a separately approved action before claiming the lead funnel is live.

Safari verification was attempted through the native app, but the computer-use capture service could not start its screen stream. No Safari result is claimed.

## Footer and hero entrance refinement — 12 October 2026

On `codex/website-design-polish`, strictly inside `site/`:

- The footer now uses a high-contrast solid Sioona mark, a larger wordmark, hairline dividers and a responsive masthead. Its labelled home link, three navigation groups and conversion links remain server-rendered and keyboard accessible. Hover rotation applies to an HTML wrapper, rather than transforming the SVG.
- `HeroPreview` observes a stable, unanimated outer frame with `amount: "some"`. Any intersection triggers a one-time opacity/translate/scale entrance, including tall mobile frames and restored scroll positions. It stays entered when leaving the viewport, respects reduced motion, and reveals on keyboard focus. The demo retains explicit play/pause controls and never autoplays.
- Regression coverage checks frame-trigger configuration, reduced motion, keyboard reveal, footer semantics and navigation. All 26 tests in 8 files pass, along with lint, design-token checks, TypeScript, diff whitespace checks and the optimized production build.
- Production smoke checks pass for all five marketing routes, SEO titles/descriptions/canonicals, Open Graph/Twitter tags, SoftwareApplication and FAQ schema, internal anchors, 16 assets, crawl/share files and 404 handling. The footer introduces no duplicate H1 or unnecessary image requests.
- Browser checks: entrance observed at 320, 390, 768, 1440 and 2560 pixels with a 740px viewport height. At 320px the preview is taller than the viewport and still reveals on scroll. A 320 × 640 reload at scrollY 640 preserves scroll position and reveals the preview. No captured browser errors/warnings. Footer inspected at desktop and mobile widths; no document overflow at 320px and the narrow layout uses two navigation columns.

The local preview remains http://127.0.0.1:3101/ . No deploy, push or commit was performed. The hosted-intake, device/browser certification, production performance and development-tool advisory limits recorded above still apply; local build success is not hosted certification.

## Scroll-triggered continuous playback — 12 October 2026

At the user's request, the hero demo now starts on first preview entry and continues looping until the user pauses it, including after scrolling away. This supersedes the earlier paused-by-default and offscreen-pause behavior for the hero. The light pause/play button has a 44px target, a dark icon, visible focus and accurate accessible state. Reduced-motion preferences still stop the loop and display a complete static frame.

The entrance and demo share their trigger. A passive scroll/resize/pageshow fallback checks the stable frame's top boundary once per animation frame until entry, then removes its listeners. It handles fast scroll jumps that skip IntersectionObserver. Tests cover this edge case, repeated full cycles, pause/resume, and reduced motion. Browser checks confirm running playback at 320, 390, 768, 1440 and 2560px, continuous playback offscreen, pause and keyboard resume. Actual browser progress advanced from step 6 to step 2 after resume; no captured console errors/warnings or horizontal overflow.

The hero-badge-label uses the exact #ff6308 brand token. Its dark pill preserves small-text contrast; the pause button remains light. Computed browser values confirm rgb(255, 99, 8) for the badge and rgb(255, 255, 255) for the button background.

All 29 tests in 8 files, lint/token checks, TypeScript, diff checks, production build and read-only route/SEO/asset smoke checks pass. Changes remain inside site; no deployment or Git publication was performed.
