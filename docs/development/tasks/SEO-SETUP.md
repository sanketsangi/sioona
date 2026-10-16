# Free SEO setup — October 16, 2026

Status: **SEO release pushed; Render release live; intended-domain DNS/TLS and live SEO acceptance blocked**.

## Scope and decisions

- User requested a free SEO setup based on the supplied OpenSEO/MCP/local-tool cookbook.
- User selected `sioona.si` and explained `.si` as “super intelligence.”
- Added isolated tooling under `tools/seo/`; production app dependencies/configuration were not changed.
- Existing unrelated changes were preserved. Baseline checkout: `main`, HEAD `620faf36a96c418dab5bd997c3f83318bf60e330`, behind local `origin/main` by 10 commits. No fetch, pull, commit or push was performed.
- No provider credits, paid APIs, subscriptions, model calls, domain/DNS writes, hosted configuration changes or deployments.

## Implemented

- Pinned Lighthouse 13.5.0 and Playwright 1.63.0 with package lock.
- Bounded sitemap/internal-link crawl, metadata/index directives, JSON-LD syntax, SSR/render comparisons, duplicate metadata, anchors, 404 and responsive homepage checks.
- Lighthouse mobile and standard desktop lab reports, JSON observations, HTML summary and viewport screenshots.
- Offline Search Console CSV analyzer with configurable impression/CTR filters, near-ranking candidates and explicit limits.
- Disposable verification covering malformed JSON-LD, noindex, missing anchors, valid native `#top`, API/non-GET blocking, CSV BOM/quoted numbers/percentage parsing and invalid metric rejection.
- Usage, credentials and cutover cookbook: `tools/seo/README.md`.

## Executed evidence

Ignored local reports:

- `tools/seo/reports/2026-10-16-hosting/index.html`
- `tools/seo/reports/2026-10-16-hosting/audit.json`
- `tools/seo/reports/2026-10-16-hosting/lighthouse-mobile.html`
- `tools/seo/reports/2026-10-16-hosting/lighthouse-desktop.html`
- `tools/seo/reports/2026-10-16-sioona-si/index.html`

Final hosting run measured October 16, 2026 at 03:03 UTC:

- `https://sioona-site.onrender.com`: nine HTML pages returned 200; no findings in custom crawl checks; homepage had no horizontal overflow at 390/1440/2560px. Sitemap's non-HTML `llms.txt` was recorded separately.
- Mobile Lighthouse: performance 86, accessibility 100, best practices 100, SEO 100.
- Standard desktop Lighthouse: performance 100, accessibility 100, best practices 100, SEO 100.
- Individual Lighthouse diagnostics include accessible-name/visible-label mismatch, unused/legacy JavaScript and request-chain/render work. Mobile initial response time was 820ms. Scores do not establish the absence of defects; detailed reports retain diagnostics. No site remediation was included in this setup task.
- Earlier mobile run scored 90; single-run lab variation is not a trend. An initial desktop run used custom throttling and was superseded by the standard preset above. Initial custom-crawl `#top` warnings were tooling false positives, corrected and regression-tested.
- `sioona.si`: no HTML pages reached; DNS `ENOTFOUND` / `ERR_NAME_NOT_RESOLVED`. Separate curl checks also failed to resolve apex and `www`. This is a machine-local observation, not a registration or global DNS verdict.
- `npm run verify`: passed after final tooling corrections. `node --check` passed; `git diff --check` passed. Initial restricted-sandbox verification could not bind a loopback port; approved execution passed.

## Open acceptance

1. Authorize/configure the intended custom domain, DNS and TLS. Then use approved deploy workflow to set `NEXT_PUBLIC_SITE_URL=https://sioona.si`, rebuild/deploy and validate canonical/sitemap/structured-data origins and redirects. No live cutover was authorized or performed here.
2. Supply the Google OAuth client file at the GSC server's configured `/Users/sanket/Documents/client_secrets.json` path (or correct its configuration), complete OAuth consent and confirm an accessible verified property. Server capability/property reads currently fail because that file is missing.
3. Read real GSC performance and URL inspection data after connection. No clicks, impressions, indexed-page counts, rankings, keyword volumes, backlink measurements or growth forecasts are asserted.
4. OpenSEO skills exist, but OpenSEO MCP and Docker are unavailable. Server-specific workflows were stopped at connectivity; the user-authorized local alternative was completed. No OpenSEO project/report was saved. Its provider-backed features are deferred under the $0 API-spend constraint.

Run again: `cd tools/seo && npm run audit:live`. Until DNS is ready, use `npm run audit:hosting` for a separately labeled hosting baseline.

## Authorized release and live checks — October 16, 2026

This section supersedes the earlier local-only authorization/status above.

- User explicitly authorized the scoped commit/push, `sioona-site` configuration and deployment, and public production checks. Only the nine named site files, `tools/seo/` source/lock/ignore files and this task record were staged. Unrelated web/backend changes were not staged; their tracked diffs were byte-for-byte unchanged after the release commit.
- Local verification: all 92 site tests across 25 files, lint/token guard, TypeScript, SEO tooling disposable verification and staged whitespace checks passed.
- Isolated release: local source commit `adf1e28d470d197d2aff6934f471c5b28bd49f22`; applied without conflicts to clean current `origin/main` (`a47927ffb8a0e44887de8f746164fffce7d3146d`) as release commit `78cfe59eea23860e7139cc4608f1053c350e1c0b`, pushed to `origin/main`. The user's dirty checkout remains on `codex/site-international-seo`; the release checkout is `/tmp/sioona-seo-release` on `codex/site-international-seo-release`. No unrelated local files were pulled, reset or stashed.
- Render service `sioona-site` / `srv-db7u2jcs728c739m1pug`: Node web service, root `site`, build `npm ci && npm run build`, start `npm start`, free plan, auto-deploy off. Merged only `NEXT_PUBLIC_SITE_URL=https://sioona.si` into existing hosted variables; no synthetic support/retention values were added. Render's env update automatically triggered intermediate deploy `dep-db8qq5rl550s73ese9mg` for the previous remote HEAD. Explicit release deploy `dep-db8qqg9vik4c73b9p1e0` targets exact release `78cfe59e`; **live at 04:53:19 UTC / 10:23:19 IST**, with successful hosted build. Hosting root returned HTTP 200 and emitted `https://sioona.si` canonical, all four English hreflang links and canonical organization/service IDs. This does not establish custom-domain reachability.
- DNS at 04:49 UTC / 10:19 IST: Cloudflare `1.1.1.1` returned `NXDOMAIN` for `sioona.si A`; Google `8.8.8.8` returned `NXDOMAIN` for `www.sioona.si A`, each with `.si` SOA authority. Normal resolver/curl also could not resolve either host. TLS and redirect checks cannot reach a server while DNS is absent; no TLS certificate success is claimed. User confirmed registration at Spaceship. Advanced DNS showed **In propagation**, **DNS Records (0)** and zero records; the record-creation approval for apex A and www CNAME was subsequently granted (see follow-up below). Authenticated Domain Manager lists `sioona.si` through October 16, 2027 and shows Spaceship nameservers `launch1.spaceship.net` / `launch2.spaceship.net`; public NS lookup still returned NXDOMAIN; no domain purchase or DNS write was performed.
- Requested `node site/scripts/verify-production.mjs https://sioona.si --production`: failed on first fetch with `getaddrinfo ENOTFOUND sioona.si`. Local console receipt: `/tmp/sioona-seo-production-smoke.log`.
- Requested `cd tools/seo && npm run audit:live`, measured **04:51:05 UTC / 10:21:05 IST**: zero reachable HTML pages; four DNS/runtime errors (`ENOTFOUND` / `ERR_NAME_NOT_RESOLVED`); Lighthouse results array empty. **No live sioona.si Lighthouse SEO score was produced.** Ignored receipts: `tools/seo/reports/2026-10-16T04-51-05.131Z/audit.json` and `index.html`; console receipt `/tmp/sioona-seo-audit-live.log`. Earlier onrender.com scores remain a separate historical hosting baseline.
- Required recovery: establish registered/delegated authoritative DNS, point apex `A` to `216.24.57.1` and `www CNAME` to `sioona-site.onrender.com` (or the provider's supported apex alias), verify both custom domains in Render and wait for TLS, confirm permanent www-to-apex redirect, then repeat both exact commands. Keep production acceptance blocked until real domain receipts exist. Existing GSC and intake/operator gates above remain open.

Post-deployment exact reruns (04:54 UTC / 10:24 IST): production smoke exited **1** with `ENOTFOUND`; `npm run audit:live` exited **1**, again with zero pages, four DNS/runtime errors and no Lighthouse scores. Final ignored audit receipts: `tools/seo/reports/2026-10-16T04-54-09.417Z/audit.json` and `index.html`. Final console receipts: `/tmp/sioona-seo-production-smoke-final.log` and `/tmp/sioona-seo-audit-live-final.log`. Render Dashboard's custom-domain section remained in a loading state after refresh; domain association/certificate state was not verified through that surface.

## Approved DNS configuration follow-up — October 16, 2026

- User explicitly approved both Spaceship DNS writes. Saved `A @ → 216.24.57.1` and `CNAME www → sioona-site.onrender.com`, each with **30-minute TTL**. Spaceship readback shows exactly two persisted records and propagation pending. Existing nameservers `launch1.spaceship.net` / `launch2.spaceship.net` were preserved. No mail, DNSSEC, billing or unrelated records were changed.
- Direct authoritative checks passed: `launch1.spaceship.net` returned `sioona.si A 216.24.57.1`; `launch2.spaceship.net` returned `www.sioona.si CNAME sioona-site.onrender.com` (NOERROR with authoritative answers).
- Render's official API initially returned no custom domains. Added `sioona.si` to service `srv-db7u2jcs728c739m1pug` at **04:58:28 UTC / 10:28:28 IST**; Render created apex `cdm-db8qtt3l550s73espvhg` and www `cdm-db8qtt3l550s73espvi0`, with `www.redirectForName=sioona.si`. Readback still marks both **unverified**. Existing CLI authentication was used without exposing or committing credentials.
- Remaining blocker is upstream publication/delegation: `.si` authoritative `b.dns.si` still returned **authoritative NXDOMAIN** for `sioona.si NS`; Google and Cloudflare public resolvers also returned NXDOMAIN. This is not merely a claim about a stale local resolver. Spaceship's global propagation diagnostics likewise showed “In propagation.” No nameserver change was made because the configured Spaceship pair is already correct.
- Post-change exact commands were rerun: production smoke exited **1** (`ENOTFOUND`), and `npm run audit:live` exited **1**. Both HTTPS curl checks failed name resolution. TLS, actual HTTP www-to-apex redirect and live canonical/Lighthouse acceptance remain **pending**, not passed.
- Latest audit measured **04:59:14 UTC / 10:29:14 IST**: `tools/seo/reports/2026-10-16T04-59-14.019Z/audit.json` and `index.html` (ignored). Zero pages, four DNS/runtime findings, no Lighthouse results. Console logs: `/tmp/sioona-seo-smoke-after-dns.log`, `/tmp/sioona-seo-audit-after-dns.log`; saved Spaceship UI proof: `/tmp/sioona-dns-records.jpg`.
- Next: wait for `.si` delegation publication; if it remains absent, inspect registration/delegation status with Spaceship. Once public DNS resolves, confirm Render verification and managed certificates, test permanent www-to-apex HTTPS redirect, and rerun the exact smoke/audit commands. No successful live sioona.si Lighthouse score is asserted.

## SEO playbook execution — October 16, 2026, 10:32–10:35 IST

- Executed the established free local SEO cookbook; no paid providers, keyword estimates, outreach or model calls were used. OpenSEO MCP is still unavailable. Local `npm run verify` passed again.
- **Delegation is now published**: `.si` authoritative `b.dns.si` returns `launch1.spaceship.net` and `launch2.spaceship.net` for `sioona.si`; Quad9 resolves apex `216.24.57.1` and www through `sioona-site.onrender.com`. Google/Cloudflare and this machine still returned cached NXDOMAIN during these checks. This supersedes the earlier authoritative-NXDOMAIN diagnosis.
- Refreshed both Render custom-domain verification requests via the documented verify endpoint (HTTP 202). Subsequent readback marks **both apex and www verified**, preserving the configured www-to-apex redirect. TLS was still pending: certificate-validating direct-IP HTTPS requests for both hostnames failed the handshake. No certificate checks were bypassed, and a working HTTPS redirect is not yet asserted.
- Exact production smoke still exited **1** with `ENOTFOUND`. Exact `npm run audit:live` exited **1**; ignored receipt `tools/seo/reports/2026-10-16T05-02-38.224Z/audit.json` / `index.html` records zero reachable pages and no Lighthouse scores.
- Completed a separately labeled hosting baseline using `npm run audit -- --url https://sioona-site.onrender.com --canonical https://sioona.si --lighthouse`. Receipt measured **05:03:02 UTC / 10:33:02 IST**: `tools/seo/reports/2026-10-16T05-03-02.314Z/` (ignored). All **nine pages HTTP 200**, valid parsed JSON-LD, no custom-crawl findings, no homepage overflow at tested widths. **Mobile:** performance 84, accessibility 100, best practices 100, SEO 100. **Desktop:** all four 100. These remain synthetic hosting-host results, not custom-domain acceptance or rankings.
- Mobile diagnostics: LCP 3.4 s, FCP 2.5 s, estimated unused JavaScript 52 KiB and render-blocking savings 390 ms. Both device reports retain a visible-label/accessibility-name diagnostic despite the aggregate accessibility score. No speculative production-code changes were made from one lab run.
- GSC capability read reconfirmed **not authenticated**: required `/Users/sanket/Documents/client_secrets.json` is missing. No property analytics, indexing observations or sitemap submission could run; authentication was not reset and no property was created. Supply the OAuth client configuration and complete Google consent before the GSC portion.
- Remaining order: complete TLS/public-resolver propagation, rerun exact production smoke and live Lighthouse, then connect GSC and inspect/indexing/sitemap state. Content/keyword priorities need actual search evidence; no traffic or rank gains are claimed.

Final readiness recheck: Cloudflare `1.1.1.1` now also resolves apex `216.24.57.1`; direct certificate-validating HTTPS still fails the handshake for both hostnames. DNS convergence is progressing; TLS remains the production acceptance blocker.

## Local on-page SEO regression upgrade — October 16, 2026

- Audited all nine `site/src/lib/site.ts` routes. Added final absolute titles (40–50 characters) and unique descriptions (142–158), preserving each canonical and en-IN/en-US/en/x-default alternate. Each page retains one H1 and an ordered heading hierarchy. Added server-rendered contextual links and one BreadcrumbList per secondary page. Organization/WebSite/Service and homepage Product/HowTo references are checked against emitted entity definitions; the review workflow now has a stable @id.
- Replaced nested full-page `/llms.txt` content with one statically generated document, using shared first-party facts and canonical route links. Documented CSV/JSON/WhatsApp TXT, structured XLSX and exported EML/MBOX, and distinguished Intercom JSON imports from the verified webhook path requiring operator setup and hosted acceptance. RLS implementation is qualified; no hosted isolation, customer, price, certification, ranking or indexing result was invented. Existing crawler rules already permit the public pages and protect `/api/`; sitemap now derives coverage from `routes`, retaining committed revision dates.
- Added `site/src/lib/seo.test.ts`: all 12 new regressions failed before implementation, then passed. Full `npm --prefix site test`: **104 passed across 26 files**. `npm --prefix site run lint`: pass. Requested `npm --prefix site exec tsc -- --noEmit` printed help/exit 1 because npm ran from the repository root; explicit-project `npm --prefix site exec tsc -- --noEmit -p site/tsconfig.json`: pass. Initial test-type issues were repaired before the successful webpack production build.
- `npm --prefix site run build -- --webpack`: pass, with explicit canonical `https://sioona.si`, app URL `https://app.sioona.si`, actual observed intake database region `aws-us-east-1`, and empty support-email/retention values. No real policy was invented or environment file edited. Build output marks `/llms.txt` static.
- Served the standalone build on loopback port 3227. Extended `verify-production.mjs` passed for all nine pages, metadata bounds/uniqueness, breadcrumbs and schema references, robots/sitemap, static instructions, HTML/Markdown negotiation, 404, social image, assets, MCP initialize/list/read and hostile-origin rejection. No contact POST or customer-data operation was performed in this SEO task. Console receipt: `/tmp/sioona-seo-e2e.log`.
- Chromium: **27 hydrated route/viewport checks passed** at 390/1440/2880px, including title/description bounds, one H1, canonical, one breadcrumb graph, 44px related-link targets and no horizontal overflow. Privacy → terms contextual navigation passed; no page errors. Receipts: `/tmp/sioona-seo-browser.json`, `/tmp/sioona-seo-related-mobile.png`. These are local production-build results, not a deployment, hosted acceptance, crawl/indexing observation or new Lighthouse score. Unrelated working-tree changes were preserved.

## Account-ready SEO integration — October 16, 2026

User confirmed scope: verification hooks, IndexNow and audit scripts while the user creates the provider accounts. Added optional build-time Google/Bing/Ahrefs verification codes, with no tags emitted when unset. Added runtime `/indexnow-key.txt` (404 unset; UTF-8/no-store/noindex when configured; no POST handler), including Markdown pass-through. No key was generated, account created, environment file edited, DNS changed or hosted deployment performed.

`tools/seo/indexnow.mjs` defaults to GET-only live-sitemap preview with redacted key status; only explicit `--submit` sends one notification after checking same-origin public URLs, published key and HTTP-200 canonical pages. Tests use mocked provider responses and prove no default POST, no submission on bad ownership/canonical, accurate 202 pending status and no retries after 429. The tool covers current public HTML sitemap entries, not deleted URLs. `readiness.mjs` checks page metadata/canonicals and optional ownership hooks; missing configuration is pending, with `--strict` available. HTML code presence is not provider-account verification; neither tool claims indexing or citations. Operator commands and official references: `tools/seo/INTEGRATION.md`.

Verification: **108 site tests passed across 27 files**; lint/token guard and explicit-project TypeScript passed; webpack production build passed. **8 SEO integration tests passed**, plus the existing disposable browser crawler/CSV verifier. Local fixture build emitted all three ownership tags; strict readiness passed for all nine pages and the key endpoint, full production SEO/Markdown/MCP smoke passed, and HTTP probes confirmed exact key body/headers, Markdown pass-through and POST 405. An apex canonical normalization issue found by the local readiness smoke was covered with a failing regression and repaired. Synthetic fixtures were confined to local process/build inputs, never deployed or stored in env files; a final build clears them. No real IndexNow/Google/Bing/Ahrefs submission occurred.

Final unconfigured build also passed: built HTML contains no ownership placeholders/synthetic codes, key endpoint returns 404/no-store/noindex, and readiness reports all nine pages pass with the four account hooks pending. Temporary local server stopped.

## Normal-browser DNS failure reproduced — October 16, 2026, 11:16–11:18 IST

User requested multi-device testing after `DNS_PROBE_FINISHED_NXDOMAIN`. Ran normal public-domain navigation without DNS overrides or certificate bypass in desktop Chromium, Pixel 7/Android emulation and iPhone 13/WebKit emulation: both apex and www failed DNS lookup in all three profiles. Firefox test binaries installed successfully but Firefox could not launch its profile; a second attempt with a direct temporary path had the same failure, so Firefox is **unavailable/unverified**, not passed. No physical phone or independent cellular network was available.

Cloudflare, Google, Quad9 and OpenDNS all resolved both hosts (8/8 A checks); separate A/AAAA probes also returned no IPv6 address. The system resolver still returned ENOTFOUND for apex; www briefly resolved in the final system lookup, while browser navigation still failed. Active DNS server is the local router `192.168.1.1`; direct default-resolver query returned NXDOMAIN for apex with `.si` SOA and a remaining authority TTL of 3259 seconds. This supports a stale negative answer at the router/upstream resolver, rather than a device-specific rendering failure. It does not prove every ISP/network is healthy or that the cache will refresh at a guaranteed time. External web-fetch tooling also could not retrieve the domain, so no independent remote-network success is claimed.

Added `tools/seo/reachability.mjs`, npm `reachability` command and four verdict regressions. **12 SEO-tool tests pass.** The live reachability run correctly exits 1 despite 8/8 public-resolver answers. It preserves normal DNS/TLS behavior and cannot pass on missing DNS evidence or an unavailable browser. Ignored detailed receipt: `tools/seo/reports/custom-domain-device-check.json`; extra public A/AAAA receipt: `/tmp/sioona-multidevice-dns.json`. Instructions and real-device/cellular acceptance boundary are in `tools/seo/INTEGRATION.md`. Domain availability remains blocked on the failing normal resolver; no router/device DNS settings were changed, and no monitor, deployment or provider mutation was performed.
