# SEO consolidation — 16 October 2026

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
