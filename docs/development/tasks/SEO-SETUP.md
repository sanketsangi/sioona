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
- DNS at 04:49 UTC / 10:19 IST: Cloudflare `1.1.1.1` returned `NXDOMAIN` for `sioona.si A`; Google `8.8.8.8` returned `NXDOMAIN` for `www.sioona.si A`, each with `.si` SOA authority. Normal resolver/curl also could not resolve either host. TLS and redirect checks cannot reach a server while DNS is absent; no TLS certificate success is claimed. User confirmed registration at Spaceship. Advanced DNS showed **In propagation**, **DNS Records (0)** and zero records; the record-creation approval for apex A and www CNAME is pending. Authenticated Domain Manager lists `sioona.si` through October 16, 2027 and shows Spaceship nameservers `launch1.spaceship.net` / `launch2.spaceship.net`; public NS lookup still returned NXDOMAIN; no domain purchase or DNS write was performed.
- Requested `node site/scripts/verify-production.mjs https://sioona.si --production`: failed on first fetch with `getaddrinfo ENOTFOUND sioona.si`. Local console receipt: `/tmp/sioona-seo-production-smoke.log`.
- Requested `cd tools/seo && npm run audit:live`, measured **04:51:05 UTC / 10:21:05 IST**: zero reachable HTML pages; four DNS/runtime errors (`ENOTFOUND` / `ERR_NAME_NOT_RESOLVED`); Lighthouse results array empty. **No live sioona.si Lighthouse SEO score was produced.** Ignored receipts: `tools/seo/reports/2026-10-16T04-51-05.131Z/audit.json` and `index.html`; console receipt `/tmp/sioona-seo-audit-live.log`. Earlier onrender.com scores remain a separate historical hosting baseline.
- Required recovery: establish registered/delegated authoritative DNS, point apex `A` to `216.24.57.1` and `www CNAME` to `sioona-site.onrender.com` (or the provider's supported apex alias), verify both custom domains in Render and wait for TLS, confirm permanent www-to-apex redirect, then repeat both exact commands. Keep production acceptance blocked until real domain receipts exist. Existing GSC and intake/operator gates above remain open.

Post-deployment exact reruns (04:54 UTC / 10:24 IST): production smoke exited **1** with `ENOTFOUND`; `npm run audit:live` exited **1**, again with zero pages, four DNS/runtime errors and no Lighthouse scores. Final ignored audit receipts: `tools/seo/reports/2026-10-16T04-54-09.417Z/audit.json` and `index.html`. Final console receipts: `/tmp/sioona-seo-production-smoke-final.log` and `/tmp/sioona-seo-audit-live-final.log`. Render Dashboard's custom-domain section remained in a loading state after refresh; domain association/certificate state was not verified through that surface.
