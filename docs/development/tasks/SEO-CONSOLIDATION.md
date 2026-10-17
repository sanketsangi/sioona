# SEO consolidation — 16 October 2026

Current live status (17 October 2026): **DNS/HTTPS/redirect and Lighthouse SEO acceptance passed; exact apex production smoke passed after approved Hero reconciliation; Firefox browser coverage unavailable.** October 16 consolidation verification below remains historical.

## Scope and sources

Consolidated branch: `codex/seo-consolidated`, based on `origin/main` at `79ccd5d6`. `codex/site-international-seo-release` is already an ancestor of that baseline. The local merge of `codex/site-international-seo` preserves its ancestry, while the resulting tree selects only its SEO/site/helper changes; unrelated web/backend/UI experiments are excluded. Original branches remain available.

Current tracked WIP was saved in the stash named `Preserve tracked SEO WIP before consolidation 2026-10-16` and reapplied with conflicts resolved. Current untracked GCP/OpenSEO source, SEO content and keyword strategy were included explicitly. Credentials, environment files, dependencies and private reports are ignored. No web/backend source changes are included relative to the baseline.

## Result

- One `seoPages` metadata map for nine routes, shared English alternates, stable entity IDs, one site graph and exactly one breadcrumb per page.
- Keyword-focused About/export-analysis content shared with negotiated Markdown, static llms discovery and contextual links. No new thin/location pages, invented prices, demand figures or ranking guarantees.
- Optional Google/Bing/Ahrefs ownership hooks and runtime IndexNow proof endpoint. Preview is the default; notifications require explicit `--submit`. No account or indexing operation was performed.
- `ops/seo/audit-site.mjs` is the main audit: build/HTTP route contracts, optional local mobile Lighthouse, PageSpeed, CrUX and read-only GSC queries. OpenSEO Compose is optional and loopback-bound.
- `tools/seo` retains distinct ownership/readiness, browser/DNS reachability and offline CSV helpers; `npm run audit` delegates to the main runner. Removed its duplicate browser crawler/fixture and redundant Lighthouse dependency/lock entries. CSV regression coverage was retained in a focused test.
- Removed old launch inventories from the consolidated tree; original copies remain on the source branch. Historical deployment receipts remain in `SEO-SETUP.md`. Removed speculative unused VM-provisioning guidance from the new operator README.
- CI tests the operator helpers and audits the rendered site. The smoke parser now understands `@graph` and checks branding without requiring an obsolete title word order.

## Verification

- Site Vitest: **112 passed, 28 files**.
- SEO runner/operator Node tests: **17 passed** (including mocked GSC and preview/submission boundaries).
- Site lint/token guard and TypeScript: passed.
- Webpack production build: passed, using explicit existing CI fixture origins and contact-policy values. These synthetic facts were local process inputs only, never deployment configuration.
- Production-build audit: **9 pages, 0 findings**.
- Loopback HTTP audit: **9 pages, 0 findings**.
- Full local production smoke: passed for nine routes, metadata/schema/discovery, static assets, HTML/Markdown, public read-only MCP protocol and private-path rejection; no contact POST.
- Chromium at **390, 1440 and 2880px**: **27 route/viewport checks passed** for one H1/breadcrumb, no horizontal overflow, >=44px related links and no page errors. This is emulation on one computer.
- Temporary loopback server on port 3228 was stopped.

GCP provider data, hosted DNS/TLS, Google indexing, paid OpenSEO features and Docker runtime were not verified. No deployment, provider configuration, paid/model call, URL submission, push, PR or main merge was performed. See `ops/seo/README.md`, `tools/seo/INTEGRATION.md` and `docs/SEO_KEYWORD_STRATEGY.md` for operator commands and measurement limits.


## Live custom-domain acceptance — 17 October 2026

Executed from checker revision `b7759428127894852365535994689a6875e671dc`, approximately **00:54–00:58 UTC / 06:24–06:28 IST**. Full commands, measured tables, failure details and receipt inventory: [SEO-SETUP.md — current live acceptance](SEO-SETUP.md#live-custom-domain-acceptance--17-october-2026). These public checks supersede the historical hosted DNS/TLS gap above; they do not change the original local-consolidation provenance.

| Gate | Current receipt |
| --- | --- |
| Normal DNS | Passed for apex/www; 8/8 public-resolver checks passed. |
| Trusted HTTPS | Passed for both hosts, SAN matched, trusted Google Trust Services WE1 certificates; no bypass or DNS override. |
| Health | HTTPS apex `/health` returned 200, `{"status":"ok"}`, no-store. |
| Redirects | HTTPS www root and `/about` returned 301 to apex, path preserved; `/about` finished 200. HTTP apex returned 301 to HTTPS. |
| Canonical SEO crawl | Apex and www each: 9 pages, 0 findings, discovery complete, exit 0; www expected canonical origin explicitly set to apex. |
| Mobile Lighthouse | All nine apex routes complete with SEO 100, accessibility 100, best practices 100; performance 88–96 (homepage 95). |
| Homepage supplemental Lighthouse | Apex desktop: 99/100/100/100; www mobile: 82/96/100/100; www desktop: 89/100/100/100 (performance/accessibility/best practices/SEO). All end at HTTPS apex; SEO acceptance passed. |
| Exact apex production smoke | **Exit 0** after matching the approved PR #193 H1 and accent span; exact repository command, all assertions active. Verified by 01:14:55 UTC / 06:44:55 IST. The earlier exit 1 and diagnostic-only pass remain historical in SEO-SETUP. |
| Exact www production smoke | Exit 1: script assumes its input origin is canonical; correct apex canonical differs from www. Separate redirected SEO crawl passed. |
| Browser matrix | Rerun: desktop Chromium, Pixel 7 Chromium and iPhone 13 WebKit, both hosts, 6/6 pass. Firefox launch unavailable locally, so reachability helper still exits 1. First run saw two apex 503s; later checks passed. |

Ignored measured receipts, checksummed locally: `ops/seo/reports/live-custom-domain-2026-10-17/` (`audit-apex/`, `audit-www/`, supplemental Lighthouse JSON/HTML, HTTP/TLS, browser and smoke logs). Detailed artifact names and runner commands are recorded in SEO-SETUP. Local reports are not committed.

The stale H1/full apex smoke gate is closed. Remaining browser coverage: repair local Firefox launch for full browser coverage. Retain www mobile contrast and homepage accessible-name diagnostics for follow-up. No field-performance/indexing claim, physical-device/independent-network proof, sustained-availability guarantee or app/API acceptance is implied. GSC/PageSpeed API/CrUX checks were skipped. This run changed only these two acceptance records; no provider writes, deployment, contact submission, indexing submission, commit or push.


### Exact production smoke closeout — 17 October 2026

PR #193 (`a0f52059`) approved the opportunity headline and highlighted conversation phrase. Updated only the stale H1 assertion in `site/scripts/verify-production.mjs`; the Hero markup/test and every other smoke assertion remain intact. `node site/scripts/verify-production.mjs https://sioona.si --production` exited **0** with normal network access, without any diagnostic bypass, DNS override or TLS bypass. The initial sandbox-only DNS failure is separate from this passing live run. All nine routes, 19 assets, discovery, metadata/schema/canonicals, HTML/Markdown, public MCP, branding, security headers, CORS and rejection checks passed. Hero test: **1 passed**. Detailed provenance, checker checksum and ignored summary receipt: [SEO-SETUP](SEO-SETUP.md#approved-hero-smoke-reconciliation--17-october-2026).

This closes apex production smoke acceptance only. Historical Lighthouse/browser measurements and remaining Firefox/indexing/app/API limitations above are unchanged. The user-authorized feature-branch commit also includes the existing OP-4 admission drill, post-commit RLS response repair, bootstrap regression/runbook changes and October 17 SEO acceptance records. No hosted OP-4 execution, deployment, provider write, contact submission or push was performed.
