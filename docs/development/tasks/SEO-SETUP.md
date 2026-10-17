# Free SEO setup — October 16, 2026

Current local tooling and validation: [SEO-CONSOLIDATION.md](SEO-CONSOLIDATION.md). Commands and provider observations below are historical; use `ops/seo/README.md` for the current audit workflow.

Status (rechecked 17 October 2026): **Custom-domain DNS, trusted HTTPS, www-to-apex redirect and live Lighthouse SEO acceptance passed. The exact repository production smoke now passes after reconciling the approved PR #193 H1; complete browser-matrix acceptance remains open.** See the current receipts below; October 16 failures are historical.

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

## Open acceptance (historical October 16 snapshot)

The domain/DNS/TLS/Lighthouse portion of item 1 is superseded by the October 17 receipts below. The GSC and provider gaps were not revalidated in this run.

1. Authorize/configure the intended custom domain, DNS and TLS. Then use approved deploy workflow to set `NEXT_PUBLIC_SITE_URL=https://sioona.si`, rebuild/deploy and validate canonical/sitemap/structured-data origins and redirects. No live cutover was authorized or performed here.
2. Supply the Google OAuth client file at the GSC server's configured `/Users/sanket/Documents/client_secrets.json` path (or correct its configuration), complete OAuth consent and confirm an accessible verified property. Server capability/property reads currently fail because that file is missing.
3. Read real GSC performance and URL inspection data after connection. No clicks, impressions, indexed-page counts, rankings, keyword volumes, backlink measurements or growth forecasts are asserted.
4. OpenSEO skills exist, but OpenSEO MCP and Docker are unavailable. Server-specific workflows were stopped at connectivity; the user-authorized local alternative was completed. No OpenSEO project/report was saved. Its provider-backed features are deferred under the $0 API-spend constraint.

Historical commands: `audit:live` and `audit:hosting` were removed during consolidation. Use the current `SEO_BASE_URL` / `SEO_LIGHTHOUSE` runner commands below.

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


## Live custom-domain acceptance — 17 October 2026

Measured approximately **00:54–00:58 UTC / 06:24–06:28 IST** against the public production site. Local checkout: clean `main` at `b7759428127894852365535994689a6875e671dc` before these documentation edits. This is the checker revision, not an independently attested deployed SHA. No deployment, DNS/provider configuration, customer communication, contact POST or indexing submission was performed. Public MCP POSTs are read-only protocol/content smoke calls.

### DNS, HTTPS and redirects

- **Passed:** normal system resolution for apex (`216.24.57.1`) and www (`216.24.57.16`, `216.24.57.18`); **8/8** A-query checks across Cloudflare, Google, Quad9 and OpenDNS returned NOERROR with addresses. No host mapping or `curl --resolve` was used. Initial sandbox-only DNS failures disappeared when the same checks ran outside the restricted sandbox.
- **Passed:** certificate-validating curl for both HTTPS hosts, `ssl_verify_result=0`; SAN matches each hostname, issuer Google Trust Services WE1. Apex certificate valid October 16, 2026 04:09:08 UTC through January 14, 2027 05:09:04 UTC; www valid October 16, 2026 04:08:15 UTC through January 14, 2027 05:08:12 UTC. No certificate bypass.
- `GET https://sioona.si/health`: **200**, `{"status":"ok"}`, `Cache-Control: no-store`.
- `https://www.sioona.si/`: **301**, `Location: https://sioona.si/`. `https://www.sioona.si/about`: **301** to `https://sioona.si/about`, followed by **200** in one redirect. `http://sioona.si/`: **301** to HTTPS apex.
- Browser reachability rerun: desktop Chromium, Pixel 7 Chromium and iPhone 13 WebKit profiles **6/6 passed** across both hosts: HTTP 200, apex final URL/canonical, one H1, no horizontal overflow. First run recorded apex Chromium/Pixel **503** responses; subsequent requests passed. This is a transient availability observation, not proof of uninterrupted service.
- Full `reachability.mjs` still exits **1**: Firefox cannot launch its local profile (`Could not find profile folder`), including a `TMPDIR=/tmp` retry. Its two checks are **unavailable**, not site failures or passes. Physical devices and independent networks were not tested.

### Production smoke — initial historical run

- Exact `node site/scripts/verify-production.mjs https://sioona.si --production`: **exit 1**, at the assertion `/<h1[^>]*>Sioona Conversation Intelligence/`. Actual persisted homepage H1: **“Your next opportunity is already in the conversation.”** Nine route HTTP/metadata/canonical/schema checks, 19 assets, discovery/404, HTML/Markdown negotiation and initial public MCP checks passed before that assertion.
- A temporary diagnostic copy skipped **only** that H1 assertion and exited **0**, including all subsequent branding, CORS/preflight, nine MCP-page/Markdown comparisons, untrusted-origin and unpublished-path rejection checks. Repository smoke source was unchanged. This diagnostic does **not** turn the exact smoke command green; reconcile its H1 expectation with approved current copy, then rerun the original command for full smoke acceptance.
- Exact smoke using `https://www.sioona.si --production`: **exit 1** at the first canonical-origin assertion, because this script expects the input origin to be canonical. The actual apex canonical is correct for the www redirect. The www crawl below explicitly expects apex canonical URLs.

### Live SEO and Lighthouse

Canonical runner (the current `tools/seo` `npm run audit` delegates to it):

```sh
SEO_BASE_URL=https://sioona.si SEO_CANONICAL_ORIGIN=https://sioona.si \
  SEO_LIGHTHOUSE=true SEO_REPORT_DIR=/tmp/sioona-live-2026-10-17/audit-apex \
  CHROME_PATH="<installed Chromium executable>" node ops/seo/audit-site.mjs
SEO_BASE_URL=https://www.sioona.si SEO_CANONICAL_ORIGIN=https://sioona.si \
  SEO_REPORT_DIR=/tmp/sioona-live-2026-10-17/audit-www node ops/seo/audit-site.mjs
```

Both exited **0**, each auditing **9 pages with 0 contract findings**; discovery checks complete with no missing sitemap/llms routes and the correct robots sitemap URL. Www follows redirects and preserves apex canonicals. Report timestamps: www **00:55:59.373 UTC / 06:25:59.373 IST**; apex **00:56:50.775 UTC / 06:26:50.775 IST**.

Lighthouse **13.5.0**, local headless Chromium **153.0.0.0**, standard mobile configuration; all **9/9 complete, SEO 100**:

| Route | Performance | Accessibility | Best practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| / | 95 | 100 | 100 | 100 |
| /about | 91 | 100 | 100 | 100 |
| /how-it-works | 90 | 100 | 100 | 100 |
| /security | 96 | 100 | 100 | 100 |
| /pricing | 93 | 100 | 100 | 100 |
| /contact | 93 | 100 | 100 | 100 |
| /developers | 88 | 100 | 100 | 100 |
| /privacy | 93 | 100 | 100 | 100 |
| /terms | 92 | 100 | 100 | 100 |

Additional sequential homepage runs used the standard desktop config and standard mobile config, saving full JSON/HTML reports:

| Requested URL | Profile | UTC fetch time | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| https://sioona.si/ | Desktop | 00:57:02.388 | 99 | 100 | 100 | 100 |
| https://www.sioona.si/ | Mobile | 00:57:12.670 | 82 | 96 | 100 | 100 |
| https://www.sioona.si/ | Desktop | 00:57:22.236 | 89 | 100 | 100 | 100 |

All three finished at `https://sioona.si/` with no Lighthouse runtime error. **Live Lighthouse SEO acceptance passes** for the measured scope. Scores are single-run lab observations, not field performance, rankings or indexing. Www mobile retains a `color-contrast` finding in the demo; apex mobile retains a visible-label/accessibility-name mismatch diagnostic despite accessibility 100. Unused/legacy JS and render-blocking diagnostics remain in receipts. No remediation was included.

### Receipts and remaining gates

Ignored local evidence directory: `ops/seo/reports/live-custom-domain-2026-10-17/` (copied from `/tmp/sioona-live-2026-10-17/`), with `SHA256SUMS.json`:

- `audit-apex/seo-audit-report.json` and `.md`: nine-route crawl plus per-route mobile Lighthouse summaries.
- `audit-www/seo-audit-report.json` and `.md`: nine-route redirected crawl, without per-route Lighthouse; additional www homepage Lighthouse JSON/HTML is separate.
- `lighthouse-sioona.si-desktop.{json,html}`, `lighthouse-www.sioona.si-{mobile,desktop}.{json,html}` and `lighthouse-home.mjs` / `.log`: full supplemental lab receipts and exact local runner.
- `apex.headers`, `www.headers`, `www-chain.headers`, `http-apex.headers`, `health.json`, `tls-apex.log`, `tls-www.log`: HTTP/TLS receipts.
- `reachability.json`, `reachability-recheck.json` and corresponding logs: initial transient 503s, successful six-check rerun, and Firefox coverage gap.
- `smoke-apex.log`, `smoke-www.log`, `smoke-diagnostic.mjs`, `smoke-diagnostic.log`: original failures and explicitly limited diagnostic pass.

DNS/TLS propagation is **no longer the acceptance blocker**. The stale H1 assertion is closed by the exact smoke rerun below. Restore Firefox coverage if full browser-matrix acceptance is required. GSC, PageSpeed API and CrUX were not queried (runner reports provider checks skipped); indexing, physical devices, independent networks, application/API user journeys and sustained availability are outside this marketing-site receipt. No commit or push was made.


### Approved Hero smoke reconciliation — 17 October 2026

The repository H1 assertion now matches PR #193 (`a0f52059`): **“Your next opportunity is already in the conversation.”**, including the `hero-headline-accent` span around “the conversation.” Hero source and its existing test are unchanged. Branding metadata/Markdown assertions retain their distinct existing requirements.

The exact repository entry point below exited **0**, verified by **01:14:55 UTC / 06:44:55 IST** on 17 October. All assertions ran; no temporary diagnostic copy, skipped assertion, fetch monkeypatch, DNS override, preload hook, or TLS bypass was used. The initial restricted-sandbox attempt failed DNS resolution; the same command passed with ordinary network access outside that sandbox.

```sh
node site/scripts/verify-production.mjs https://sioona.si --production
```

Passed all nine route HTTP/landmark/metadata/canonical/hreflang/locale/schema checks, internal links, 19 assets, discovery/404, HTML/Markdown negotiation, public MCP handshake and all nine page comparisons, branding/H1, CORS/preflight, untrusted-origin and unpublished-path rejection, and complete security/Vary headers. Public MCP POSTs exercised read-only protocol/content operations; no contact POST or provider write occurred. The checker source is this branch's committed script, based on `4147e2b2`; the live deployment SHA was not independently attested.

Ignored local summary receipt: `ops/seo/reports/live-custom-domain-2026-10-17/smoke-apex-reconciled-receipt.json`, included in that directory's `SHA256SUMS.json`. Checker script SHA-256: `82013c80457fc9c37c8ecab4eac50983f99bde4e15577c1bb1df79bb4526b131`. Earlier failed and diagnostic logs remain historical evidence. The existing Hero regression test passed (1 test), and `git diff --check` passed. No new Lighthouse/browser/SEO crawl is claimed by this smoke rerun; Firefox, field/indexing, physical-device/network, sustained-availability and app/API gates remain as stated above. The full working tree is prepared for the user-authorized feature-branch commit; no push or deployment was performed.
