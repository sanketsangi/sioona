# Free SEO cookbook for Sioona

Intended primary domain: **https://sioona.si**. Sanket selected this domain; `.si` means **super intelligence** in the brand. That meaning is not a search-ranking or product-capability claim.

This setup uses local Lighthouse + Playwright and optional first-party Google Search Console data. No paid API, trial balance, model API, subscription or hosted crawler is used. Existing Codex usage, electricity, hosting and domain registration are separate from the tools' $0 incremental license/API cost.

## Install and run

From the repository root:

```sh
cd tools/seo
npm ci --no-fund --no-audit
npm run browser:install
npm run verify
npm run audit:live
```

Requires Node >=22.19 and Python 3. The current machine already has compatible Playwright Chromium. A fresh machine needs `browser:install`. In a restricted sandbox, browser launches, network access and the verification server may require execution approval.

- `npm run audit:live`: audit `https://sioona.si`, including mobile and desktop Lighthouse.
- `npm run audit:hosting`: audit `https://sioona-site.onrender.com` separately; this hosting baseline is not acceptance of the intended domain.
- `npm run audit -- --url http://127.0.0.1:3101 --canonical https://sioona.si --lighthouse`: check a locally served production build configured for the intended domain. Build/start separately; development-server performance is unsuitable for comparisons.
- `npm run audit -- --url https://sioona.si --limit 20 --out reports/manual-run`: crawl without Lighthouse.
- `npm run gsc -- gsc/queries-last-3-months.csv --out reports/gsc-queries.json`: analyze an export without API access.

Reports default to timestamped folders under `reports/`. Open `index.html`, `audit.json`, and `lighthouse-mobile.html` / `lighthouse-desktop.html`. Homepage screenshots use 390, 1440 and 2560 pixel widths. Reports and GSC exports are gitignored.

## What it checks

The browser audit discovers the sitemap and same-origin links, then checks HTTP statuses, canonical URLs (preferred page addresses), titles/descriptions, H1s, language, robots/noindex directives, social tags, JSON-LD syntax, duplicate metadata, internal anchors, server-rendered content, JavaScript rendering differences, homepage overflow, and a nonexistent URL's 404 response. Default limit: 40 HTML pages; maximum: 100.

Crawl browser sessions block third-party requests, service workers, non-GET/HEAD requests, `/api` and `/mcp`. Lighthouse performs isolated normal page navigation without form interactions. Use only on public marketing sites or disposable local builds, not authenticated/customer routes. Robots content is recorded; this bounded owner audit is not a general robots-policy engine. JSON-LD syntax does not prove Google rich-result eligibility.

Exit code 1 means an error or no reachable HTML pages. Warnings alone leave exit code 0. A technical score is not a ranking, indexing verdict, conversion result, or traffic promise. Lighthouse supplies synthetic lab data, not field Core Web Vitals. Repeat comparable production measurements before optimizing performance.

## Search Console: blocked on credentials

On October 16, 2026, installed `mcp-gsc` tools `get_capabilities` and `list_properties` reported that configured OAuth file `/Users/sanket/Documents/client_secrets.json` does not exist. Authentication/property access are **not complete**. No token was deleted; no property or sitemap was written.

To finish:

1. In your Google Cloud project, enable the **Google Search Console API**, configure OAuth consent and create a **Desktop app** OAuth client. For an app in testing, add your account as a test user.
2. Download the client JSON to the configured path, or update `GSC_OAUTH_CLIENT_SECRETS_FILE` to its real absolute path. Keep credentials/tokens outside this repository; never paste them into chat or commit them.
3. Restart the MCP connection if configuration changed. Run `reauthenticate`, complete Google's consent screen, then `list_properties`. Use the exact returned property identifier.
4. A domain property normally uses `sc-domain:sioona.si`. DNS verification, property creation and sitemap submission are external writes requiring explicit authorization.
5. Once authenticated and verified, read queries/pages over 3 months, compare equal periods, and inspect representative URLs. Missing rows do not prove zero demand.

Free fallback: export English-language **Queries** and **Pages** CSVs from an accessible verified property, put them under ignored `gsc/`, and run `npm run gsc`. Record property, date range, country/device filters and export date beside each CSV. Filters default to positions 8–20, CTR below 2%, and at least 100 impressions. These are adjustable investigation filters, not universal benchmarks. Average position is not a fixed live rank. Never sum overlapping exports.

## Intended-domain cutover (not executed)

From this machine, both `sioona.si` and `www.sioona.si` failed DNS resolution on October 16, 2026. This does not establish registration or global DNS state.

Authorize DNS/Render custom-domain configuration and verify TLS before launch. Set hosted `NEXT_PUBLIC_SITE_URL=https://sioona.si` through the approved deployment workflow, rebuild/redeploy, then check the homepage, canonical tags, sitemap and structured-data origins. Decide `www` redirection and hosting-host duplicate-content policy. Do not change the live canonical setting until the custom domain works. This setup changed no DNS, hosted environment variables or deployments.

## OpenSEO and later software

OpenSEO skills are installed, but its MCP/server is not connected; Docker is absent. Its server-dependent project setup/audit workflows cannot complete. This cookbook is an independent local fallback; no OpenSEO project or hosted report was created.

Upstream Docker setup requires a DataForSEO key for SEO data, so Docker is unnecessary for today's no-credit-spend workflow. Do not add DataForSEO, Firecrawl, Jina, OpenRouter or other provider keys to run these commands. Jina and Firecrawl are separate services. Finite trial credits cannot last indefinitely.

First establish domain reachability and GSC data. When competitor/backlink research becomes a concrete need, evaluate **Ahrefs**; keep local checks and GSC. Verify current pricing/limits before buying. No account or subscription was created here.

References:

- [Lighthouse CLI](https://developer.chrome.com/docs/lighthouse/overview/)
- [OpenSEO Docker setup](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md)
- [OpenSEO provider requirements](https://github.com/every-app/open-seo/blob/main/docs/DATAFORSEO_API_KEY.md)
- [Google API authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)
- [Ahrefs plans](https://ahrefs.com/pricing)
