# Local SEO stack

OpenSEO and an independent audit runner. No customer transcripts, paid-provider calls, model calls, cloud provisioning or index submissions are part of the audit command.

## Run locally

Use Node 22.22.2+, 24.15+ or 26+, Docker Engine/Desktop and Compose v2. OpenSEO’s Docker mode has no authentication, so the published port binds to loopback only. Port 3001 conflicts with the usual Sioona marketing dev port: use 3101 for the site, or change `OPENSEO_PORT`.

```sh
cd ops/seo
cp .env.example .env
docker compose up -d open-seo
# Open http://localhost:3001; keep .env and secrets out of Git.
```

OpenSEO data persists at `/app/.wrangler` in `open_seo_data`. Do not use `docker compose down -v` unless intentionally deleting the database. The upstream image tag defaults to `latest`; pin `OPEN_SEO_IMAGE` to a reviewed image digest for repeatable deployments. Telemetry is disabled with `OPENSEO_TELEMETRY_DISABLED=true` and upstream’s documented `DO_NOT_TRACK=1` fallback.

The dashboard’s keyword/backlink/AI features use optional **paid** DataForSEO/OpenRouter credentials. DataForSEO’s value is base64 of `email:API-password`, which is still a secret. Leaving providers blank does not make paid datasets available; the audit runner below remains usable independently. Do not enable OpenSEO recurring paid checks without an approved budget.

From the repository root, after the normal site production build:

```sh
node ops/seo/audit-site.mjs
```

The runner reuses `site`’s installed jsdom when standalone dependencies are absent. It reads `.next/server/app` HTML plus generated sitemap/robots/llms bodies. It writes `ops/seo/reports/seo-audit-report.json` and `.md`, and exits nonzero for route/discovery contract defects. It does not build the site for you. Production builds require the same approved public origin and contact-policy settings as normal deployment. Test fixtures are only local/CI facts, never public launch settings.

For an HTTP crawl and optional sequential mobile Lighthouse runs:

```sh
npm --prefix ops/seo ci
SEO_BASE_URL=http://127.0.0.1:3101 SEO_LIGHTHOUSE=true node ops/seo/audit-site.mjs
```

A Chrome/Chromium binary is required for local Lighthouse. Set `CHROME_PATH` if it is not discoverable. Use a production site server on 3101, not the OpenSEO dashboard on 3001. `SEO_CANONICAL_ORIGIN` may override the expected canonical origin when testing a local copy; normally it is inferred from the homepage canonical.

Docker includes Chromium and the runner’s dependencies:

```sh
cd ops/seo
docker compose --profile audit run --rm audit
# Or set SEO_BASE_URL=https://YOUR-APPROVED-DOMAIN in .env first.
```

The site/build is mounted read-only. Reports are mounted separately. `http://host.docker.internal:3101` reaches a host site server; that server must listen on a Docker-reachable interface. Google PageSpeed cannot fetch localhost. The one-shot audit service does not depend on a functioning OpenSEO dashboard or paid provider keys.

## GCP APIs and Search Console

Use an existing approved GCP project. Enable PageSpeed Insights (`pagespeedonline.googleapis.com`), Chrome UX Report (`chromeuxreport.googleapis.com`) and Search Console (`searchconsole.googleapis.com`). This repository does not create projects, billing accounts, VMs or API keys.

1. Create an API key restricted to PageSpeed Insights and CrUX. Set `GCP_API_KEY` and a public HTTPS `SEO_BASE_URL`. The runner makes nine mobile PageSpeed calls and one origin-level PHONE CrUX request per run. Inspect your project's quotas; no automatic recurring job is installed. API failures are reported as unavailable, never zero performance scores. A CrUX 404 often means insufficient field data.
2. Create a dedicated service account; grant its email the minimum read access to the exact property in Search Console. GCP IAM roles alone do not grant GSC property access. Scope is `https://www.googleapis.com/auth/webmasters.readonly`.
3. Prefer an existing short-lived `GSC_ACCESS_TOKEN` for host runs when available. Otherwise place a service-account JSON file at `ops/seo/secrets/gcp-service-account.json`, protect it with `chmod 600`, and never commit it. For host execution set `GOOGLE_APPLICATION_CREDENTIALS` to that path. Docker mounts it read-only at `/run/secrets/gcp-service-account.json`. An absent credential file is reported as unavailable only when GSC is configured.
4. Set the exact `GSC_PROPERTY` (`sc-domain:your-domain` or `https://your-domain/`). The runner queries final web data from 31 days ago through 3 days ago, grouped by query, page and country. It pages up to 10,000 rows and reports truncation. Search Console returns top rows, excludes anonymized queries and is not an exhaustive keyword dataset.
5. Review opportunities with at least 50 impressions and average positions 5–20. Low CTR is a review cue, not proof of a bad title. Query data stays in ignored, private-permission reports. Never add those reports to Git or upload them as public CI artifacts.

Host Node can load the environment file without exposing secret values in command arguments:

```sh
node --env-file=ops/seo/.env ops/seo/audit-site.mjs
```

The audit runner uses the service account directly. It does not wire service-account credentials into OpenSEO’s separate Google OAuth integration. If you want GSC inside the dashboard too, follow upstream’s Google Search Console OAuth guide and configure its client ID, secret and token-encryption secret separately.

## Verification and limits

```sh
npm --prefix ops/seo test
npm --prefix site test
npm --prefix site run lint
(cd site && npm exec tsc -- --noEmit)
npm --prefix site run build -- --webpack
node ops/seo/audit-site.mjs
```

`npm --prefix site exec tsc -- --noEmit` may run from the repository root with this npm version; use the explicit subshell above so `tsc` finds `site/tsconfig.json`. The existing Marketing site CI runs Vitest and now audits the rendered production build.

The crawler checks the explicit public-route manifest, unique canonical per page, metadata lengths, heading order, internal route destinations, hreflang, JSON syntax, supported schema required fields, graph references and discovery completeness. It does not validate the whole Schema.org vocabulary or certify Google rich results. Verify public URLs manually with [Schema.org Validator](https://validator.schema.org/) and [Google Rich Results Test](https://search.google.com/test/rich-results). HowTo and basic Product/SoftwareApplication descriptions remain useful entity markup, but are not promises of rich-result eligibility. No fictitious price/review fields are added merely to pass rich-result tests.

No IndexNow calls are sent: a real domain key, hosted verification file and explicit submission are prerequisites. Robots access covers Google, Bing, OpenAI search, Perplexity and Claude; access and `/llms.txt` do not guarantee indexing or AI citations. Build mode cannot prove HTTP behavior or field performance. Skipped/unavailable Google checks are listed as coverage gaps.

Sources: [upstream Docker setup](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md), [GCP free usage](https://cloud.google.com/free/docs/free-cloud-features#compute), [GSC authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [GSC query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [PageSpeed](https://developers.google.com/speed/docs/insights/v5/get-started), [CrUX](https://developer.chrome.com/docs/crux/api/), [OpenSEO Google integration](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).
