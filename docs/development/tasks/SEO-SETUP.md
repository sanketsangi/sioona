# Free SEO setup — October 16, 2026

Status: **local tooling implemented and executed; intended-domain and GSC acceptance blocked**.

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
