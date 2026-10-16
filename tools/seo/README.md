# SEO operator helpers

The main audit is [ops/seo](../../ops/seo/README.md): production-build contracts, HTTP crawl, optional mobile Lighthouse, PageSpeed, CrUX and read-only Search Console opportunities. The former `audit.mjs` browser crawler and its Lighthouse dependency were removed during consolidation; `npm run audit` delegates to that runner. See [the keyword strategy](../../docs/SEO_KEYWORD_STRATEGY.md) for the buyer intent and measurement goals.

This directory keeps checks that serve a separate purpose:

| Command (from tools/seo) | Purpose |
| --- | --- |
| `npm test` | Mocked ownership/submission contracts, DNS verdicts and offline CSV regressions |
| `npm run readiness -- --origin https://sioona.si` | GET-only live metadata and optional account-hook checks; absent ownership settings are pending |
| `npm run indexnow -- --origin https://sioona.si` | Preview sitemap notifications; sends nothing without explicit `--submit` |
| `npm run reachability -- --origin https://sioona.si` | Normal DNS/TLS and desktop/mobile browser emulation; requires `dig` and installed browsers |
| `npm run gsc -- gsc/queries.csv --out reports/gsc-opportunities.json` | Offline fallback for English-language Search Console CSV exports |

Install helpers with `npm ci`; install the reachability browser engines with `npm run browser:install`. API/build audits do not need these browsers. Reports, CSV exports, credentials and dependencies are ignored. GSC CSV candidates use 100+ impressions, position 8–20 or CTR below 2%; the API runner uses 50+ impressions and position 5–20. These are review filters for different inputs, not demand estimates or ranking guarantees. Never sum overlapping exports.

[INTEGRATION.md](INTEGRATION.md) documents verification codes, ownership requirements, explicit submissions and browser limitations. No helper creates provider accounts, changes DNS, provisions GCP or deploys the site. Historical rollout receipts remain under `docs/development/tasks/SEO-SETUP.md`; their old DNS or account observations are not current status.
