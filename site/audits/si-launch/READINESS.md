# Sioona.si SEO, GEO and marketing-site launch readiness

Audit date: October 16, 2026 (Asia/Kolkata). Intended marketing origin: **https://sioona.si**. Intended product origin: **https://app.sioona.si**. This task uses “Signal Intelligence” as the `.si` brand meaning supplied in the current request.

**Verdict: local marketing build and smoke verification passed; hosted production launch remains NO-GO pending external acceptance.** This is production-mode testing on loopback, not an end-to-end transaction through production infrastructure. All edits, generated artifacts and test execution stayed in `site/`. Repository brand references were inspected read-only. No backend/web tests, customer-data operations, domain changes, deployments or contact POSTs occurred.

## Gates and counts

- Regression baseline: 8 focused tests ran; 3 failed on missing hreflang, service areas and entity IDs, 5 passed. After implementation: all 8 passed.
- Full unit suite: **92 passed, 25 test files passed**. Includes mocked contact success/failure/retry and public MCP protocol coverage; it does not prove hosted intake persistence.
- ESLint and token guard: passed (`check-tokens: ok`). TypeScript: passed. These were rerun after smoke-script corrections. Whitespace check: passed.
- Exact requested webpack production build: passed; **20/20 static generation jobs**. This includes framework/error/metadata routes, not 20 distinct marketing pages. Actual installed Next version: 16.3.8. Node: 23.11.0; repeat deployment CI on the supported Node LTS runtime before launch.
- Full production smoke: **24 PASS groups**, covering nine public routes, 21 home assets, HTML/Markdown negotiation for nine routes plus a missing page, robots/sitemap/social icons, all eight homepage schema types, MCP discovery/initialize/tools/list/read, nine canonical MCP catalog URLs, nine MCP/Markdown exact matches, origin rejection and unpublished-path rejection.
- Chromium: **34 PASS groups**: 27 route/viewport combinations (nine routes × 390/1440/2560px), three menu Escape/focus-return checks, and four no-JavaScript/reduced-motion checks. **0 console errors, 0 page errors, 0 contact POST attempts**. Physical Safari/iOS, actual low-power mode and hosted browser acceptance were not performed.
- Temporary server was started on `127.0.0.1:3210` with the build's exact public environment; termination evidence is recorded below after shutdown.

## Implemented and verified

- Production URL validators already accepted both requested HTTPS origins; no `.si` whitelist exception was needed. Tests preserve rejection of HTTP, credentials, paths, queries, fragments, loopback and unapproved temporary Render/Vercel hosts. Validators do not verify DNS, TLS or ownership and are not an allowlist of all possible custom domains.
- Root metadata, homepage overrides and `pageMetadata` now use one shared route-specific canonical/alternate helper. Every route emits `en-IN`, `en-US`, `en` and `x-default`, each pointing to that route on `https://sioona.si`.
- All routes emit primary Open Graph locale `en_US` and alternate locale `en_IN`. HTML stays `lang="en"` because one English document is shared. There are no country-specific content variants or geo redirects.
- `Organization` and `Service` declare `areaServed` countries `IN` and `US`. Organization preserves Mumbai/Maharashtra/IN and declares `knowsAbout: ["Signal Intelligence", "Conversation Intelligence"]`.
- Stable schema identities: `https://sioona.si/#organization`, `/#website`, `/#service`, `/#product`. Service provider and website publisher point to the organization ID. `knowsAbout` is an Organization/Person property, so it is not placed directly on Service.
- Homepage contains Organization, WebSite, Service, Product, SoftwareApplication, FAQPage, HowTo and BreadcrumbList. Other routes inherit Organization/Service/WebSite; Developers additionally has BreadcrumbList. Not every page needs every schema type. FAQ has seven questions; HowTo describes the four public steps. Syntax/shape/origin checks do not prove Google rich-result eligibility or visibility.
- Markdown negotiation remains in **`src/proxy.ts`**, the Next 16 convention; `src/middleware.ts` does not exist. HTML/Markdown variants retain complete `Vary`, status codes, security headers and 404 recovery/noindex behavior.
- Robots allows the listed search/AI crawlers and disallows `/api/`. This is not an authorization boundary. Sitemap has nine public HTML routes plus `/llms.txt`, deterministic content-revision dates and only canonical origins. HTML supplies hreflang; duplicate sitemap hreflang markup is unnecessary.
- `/llms.txt`, negotiated Markdown, discovery and every MCP tool result use canonical `.si` URLs. Discovery namespace was corrected from `app.vercel.sioona-site/public-content` to `si.sioona/public-content`; the protocol server name remains `sioona-public-content`. This discovery identity change should be communicated to any existing manifest consumers at cutover.
- Removed the stale “hosted on Vercel” assertion from shared agent guidance. Public MCP remains stateless/read-only, rejects untrusted Origin and unpublished paths, and offers no customer-data or write tools.
- Browser hydration preserved canonical/hreflang links, a single H1, heading order, no horizontal overflow, and `https://app.sioona.si` sign-in links at all tested sizes.

## International targeting: limits

Google's current list has 20 generic ccTLDs and omits `.si`; a country-code domain remains a strong country signal. Hreflang describes locale suitability; it does not convert `.si` into a generic TLD. Multiple annotations pointing to one shared English URL do not create localized versions. Open Graph locales are social metadata. Schema service areas describe the offering, not a documented mechanism to override Google's ccTLD targeting.

This implementation provides the explicit signals requested, **not a promise of India/US rankings or neutralization of Slovenia targeting**. Validate actual country/device visibility in Search Console after indexing. If differentiated content becomes necessary, design distinct regional URLs with self-consistent canonicals and reciprocal hreflang rather than claiming this single-URL setup already provides them.

Sources checked during this audit:

- [Google multi-regional sites and current generic ccTLD list](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Schema.org knowsAbout](https://schema.org/knowsAbout)
- [Schema.org Service and areaServed](https://schema.org/Service)
- Installed Next metadata guide: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`.

## Repository domain/brand inventory

The complete point-in-time source matches are in [domain-inventory.txt](domain-inventory.txt): **85 matching lines in 34 files**, including hidden `.cursor/` references, captured after metadata implementation and before writing this report. Generated output, dependencies, Git objects, caches and lockfiles were excluded. Line numbers refer to that checkpoint.

- Marketing runtime origins are centralized in `src/lib/site.ts`; approved legacy platform hosts are validation fallbacks, not the canonical origin when `.si` is configured. Historical `audits/is-agentic/public-baseline.json` and release evidence remain historical.
- Tests in `site/src/proxy.test.ts` and `site/src/app/mcp/route.test.ts` intentionally retain a legacy Vercel request URL; emitted origins still derive from configuration. Old platform names in release docs/README describe earlier deployments or fallbacks.
- Outside scope: `web/src/app/layout.tsx` still displays **Sioona.ai**. `web/README.md`, `PRODUCT.md`, `PARTNER_DEMO.md` and `.cursor/` product guidance retain old branding. Review these for a coordinated brand migration; none were edited here.
- `backend/app/models/user.py`, `web/src/lib/auth-guard.ts`, `web/src/lib/actor-assertion.ts` and related tests use `demo@sioona.ai` as an identity. These are authentication/fixture references, not marketing canonical URLs. Do not replace them mechanically.
- `render.yaml`, deployment/architecture/staging docs and infrastructure tests refer to service name `sioona-site`; that hosting resource identifier does not need to match the domain.
- The previous `tools/seo/` setup record says “super intelligence,” from an earlier instruction. It was left unchanged under the current site-only scope; this report records the newer “Signal Intelligence” meaning.

## Enterprise and hosted acceptance gaps

- **Intake persistence unverified:** local smoke sends no contact POST. Production backend URL/service token, matching receipt, idempotent retry, durable row readback, queue ownership and abuse controls remain operator acceptance. No backend runtime was changed or tested.
- **Public policy is a fixture:** the requested `pilot@sioona.si`, retention wording and `ap-south-1` were used exactly for this local build. Mailbox operation, retention enforcement and actual database region were not established. Existing `.env.local` was not edited. Do not deploy this artifact until those facts are approved and accurate.
- **Trust evidence is open:** public copy appropriately says certifications/audit reports are unavailable, and requests agreed DPA/subprocessors/export-storage/deletion terms before customer-data transfer. This site audit does not establish SOC 2, enterprise security certification, SLA, backup/recovery or tenant-isolation behavior.
- **Security headers:** local responses pass nosniff, frame denial, referrer and permissions policies. Application code does not supply a Content Security Policy or HSTS. Evaluate CSP with Next inline scripts and hosting-layer TLS/HSTS separately; do not add an untested restrictive policy or preload HSTS during cutover. Edge/WAF rate limits and actual CDN caching need hosted verification.
- **Discovery is not indexing:** llms.txt/MCP and crawler rules make public content readable, but no measurement establishes search indexing, AI citation or traffic. Product schema has no invented price/reviews/ratings; FAQ/HowTo presence is not a rich-result guarantee.

## Cutover checklist

- [ ] DNS: register/control `sioona.si`; add the exact custom domain to the intended marketing service; use current provider-prescribed apex records, not an old copied IP. Remove conflicting records only with approval. Verify authoritative and public resolvers.
- [ ] Canonical routing: choose apex, redirect `www` and HTTP to HTTPS apex, decide the old hosting-host/old-domain redirect policy, and separately provision `app.sioona.si`. A Sign in URL in local HTML does not prove the app is ready.
- [ ] TLS: validate certificate names/chains/renewal for apex, www and app; verify redirects without loops, no mixed content and the correct host at the edge.
- [ ] SPF: choose the real outbound mail provider, publish a single appropriate SPF policy and verify lookup limits. No record can be invented before provider selection.
- [ ] DKIM: configure the provider's actual selector/key, check its TXT/CNAME and validate a signed delivered message. Selector/provider are unknown here; absence was not inferred by guessing a selector.
- [ ] DMARC: publish the approved policy/report mailbox, validate alignment with SPF or DKIM and review reports before tightening enforcement.
- [ ] Mailbox: confirm pilot@sioona.si receives mail and has an accountable human; email authentication does not prove inbox monitoring.
- [ ] GSC: complete OAuth connection and verify `sc-domain:sioona.si` with DNS TXT, submit `https://sioona.si/sitemap.xml`, inspect representative URLs/live rendered HTML and establish country/device baselines. Do not submit or assert indexing as part of local smoke.
- [ ] Deployment: rebuild on supported Node LTS with real approved policy/intake configuration; run `node scripts/verify-production.mjs https://sioona.si --production` and repeat browser checks on the live custom domain.
- [ ] Intake/enterprise: separately approve one synthetic hosted request/readback and idempotent retry; verify intake/edge abuse controls and complete the security/procurement gates above.

## Reproduction environment

The exact build was:

```sh
NEXT_PUBLIC_SITE_URL=https://sioona.si NEXT_PUBLIC_APP_URL=https://app.sioona.si PILOT_CONTACT_SUPPORT_EMAIL=pilot@sioona.si PILOT_CONTACT_RETENTION='30 days for pilot intake records' PILOT_CONTACT_HOSTING_REGION=ap-south-1 npm run build -- --webpack
```

The standalone server used the same public variables plus `HOSTNAME=127.0.0.1 PORT=3210 npm start`. Verification used exactly `NEXT_PUBLIC_SITE_URL=https://sioona.si node scripts/verify-production.mjs http://127.0.0.1:3210`. No intake secrets were needed by or exposed through these checks.

Ignored local evidence: `.cache/si-launch/{lint.txt,typecheck.txt,unit.txt,build.txt,smoke.txt,browser.cjs,browser.json,browser.txt,home-390.png,home-1440.png,home-2560.png,dns.json,tls.txt}` plus complete captured HTTP bodies. These are local diagnostic artifacts, not hosted proof. The appendices below preserve the exact five requested endpoint outputs.

## Exact requested HTTP outputs

Captured from the local production server; text is unmodified. For the two head commands, the full response was captured first and the identical first 35 lines extracted, avoiding curl broken-pipe artifacts.

### robots.txt

```sh
curl -sS http://127.0.0.1:3210/robots.txt
```

```text
User-Agent: *
Allow: /
Disallow: /api/

User-Agent: GPTBot
Allow: /
Disallow: /api/

User-Agent: OAI-SearchBot
Allow: /
Disallow: /api/

User-Agent: ChatGPT-User
Allow: /
Disallow: /api/

User-Agent: ClaudeBot
Allow: /
Disallow: /api/

User-Agent: Claude-Web
Allow: /
Disallow: /api/

User-Agent: PerplexityBot
Allow: /
Disallow: /api/

User-Agent: Googlebot
Allow: /
Disallow: /api/

User-Agent: Google-Extended
Allow: /
Disallow: /api/

User-Agent: Applebot-Extended
Allow: /
Disallow: /api/

Sitemap: https://sioona.si/sitemap.xml
```

### sitemap.xml

```sh
curl -sS http://127.0.0.1:3210/sitemap.xml
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>https://sioona.si/</loc>
<lastmod>2026-10-14T13:01:00+05:30</lastmod>
<changefreq>weekly</changefreq>
<priority>1</priority>
</url>
<url>
<loc>https://sioona.si/about</loc>
<lastmod>2026-10-14T04:00:24+05:30</lastmod>
<changefreq>monthly</changefreq>
<priority>0.8</priority>
</url>
<url>
<loc>https://sioona.si/how-it-works</loc>
<lastmod>2026-10-13T20:37:48Z</lastmod>
<changefreq>monthly</changefreq>
<priority>0.9</priority>
</url>
<url>
<loc>https://sioona.si/pricing</loc>
<lastmod>2026-10-13T20:37:48Z</lastmod>
<changefreq>monthly</changefreq>
<priority>0.9</priority>
</url>
<url>
<loc>https://sioona.si/contact</loc>
<lastmod>2026-10-14T10:03:09+05:30</lastmod>
<changefreq>monthly</changefreq>
<priority>0.9</priority>
</url>
<url>
<loc>https://sioona.si/security</loc>
<lastmod>2026-10-13T20:37:48Z</lastmod>
<changefreq>monthly</changefreq>
<priority>0.8</priority>
</url>
<url>
<loc>https://sioona.si/developers</loc>
<lastmod>2026-10-14T13:01:00+05:30</lastmod>
<changefreq>monthly</changefreq>
<priority>0.8</priority>
</url>
<url>
<loc>https://sioona.si/privacy</loc>
<lastmod>2026-10-14T10:03:09+05:30</lastmod>
<changefreq>monthly</changefreq>
<priority>0.5</priority>
</url>
<url>
<loc>https://sioona.si/terms</loc>
<lastmod>2026-10-13T20:37:48Z</lastmod>
<changefreq>monthly</changefreq>
<priority>0.5</priority>
</url>
<url>
<loc>https://sioona.si/llms.txt</loc>
<lastmod>2026-10-14T13:30:35+05:30</lastmod>
<changefreq>monthly</changefreq>
<priority>0.8</priority>
</url>
</urlset>
```

### llms.txt — first 35 lines

```sh
curl -sS http://127.0.0.1:3210/llms.txt | head -n 35
```

```text
# Sioona Conversation Intelligence

Sioona Conversation Intelligence works with your existing customer chats. It finds lead, retention and upsell signals, and humans review every one in Shadow Mode before anything is acted on.

# Sioona — Pilot offer

## Sioona: Two weeks. Your chats. A clear decision.

Evaluate Sioona with one redacted export before committing to ongoing use.

Scope and price agreed before the pilot starts. No public list price is available yet.

- One redacted chat export, with no live integration required

- Two weeks of signal review in Shadow Mode

- Insights, uploads, evaluation and taxonomy tools

- A Signal Score measured against your team’s review

- An agreed threshold and a clear go or no-go decision

Ongoing use, volume and procurement requirements are discussed separately after the results.

## Sioona: Pilot scope and evidence

A pilot starts from one redacted chat export and runs for two weeks. Scope and price are agreed before it starts. No public list price is published.

Supported exports: Intercom JSON, WhatsApp Business text exports, and CSV or JSON files. No mailbox access, chat-tool API keys or CRM credentials are required.

Every signal shows the exact source words behind it. Evidence anchors identify the source message and text span so reviewers can reconstruct the evidence from persisted source text.

Signal Score is precision measured against human review: correct signals divided by reviewed signals. Pilot default: go at 80% or higher, with at least 5 reviews. Thresholds are agreed with each team.

Shadow Mode never sends messages to customers. Suggested Next Actions are display-only; humans decide and follow up in their own tools.
```

### About Markdown — first 35 lines

```sh
curl -sS -H "Accept: text/markdown" http://127.0.0.1:3210/about | head -n 35
```

```text
# Sioona — About

Sioona is conversation intelligence for the customer chats a team already has. It finds lead, retention and upsell signals in those conversations, shows the source words behind each signal, and leaves every follow-up in human hands. It is not a chatbot, and it does not replace Intercom, WhatsApp, or the other tools a team uses to talk to customers.

Shadow Mode is how a pilot runs. Detection sits beside the team’s normal process. Reviewers see the transcript, the words that fired the signal, and a Suggested Next Action that stays on screen. Nothing is sent to a customer. The team follows up in its own tools, then records whether the signal was correct. Signal Score is that review precision, and it is the go or no-go measure for the pilot.

A pilot starts from one redacted export and runs for two weeks. Supported files are Intercom JSON, WhatsApp Business text exports, and CSV or JSON. Mailbox access, chat-tool API keys, and CRM credentials are not required to begin. On ingest, Sioona masks email addresses, phone numbers, tax and national ID numbers, and long account numbers. Masking is defense in depth, so teams should still redact an export before sharing it.

Scope, price, retention, storage, and any data-processing terms are agreed before a pilot begins. The contact form collects business details, stores a receipt, and requests a discussion. Submitting it does not create a subscription, and customer transcripts do not belong in that form. Sioona is built for customer teams that need a person in the loop, including finance and high-volume support desks.

## When to use Sioona

Use Sioona Conversation Intelligence to audit existing support and sales conversations for retention risks, upsell opportunities, and lead signals. Best-fit jobs include reviewing Intercom support exports for cancellation intent, WhatsApp conversations for buying intent, CSV customer-chat exports for expansion requests, and XLSX or email support exports prepared as supported CSV or JSON. Confirm import scope before sharing files; native XLSX or mailbox access is not promised by this public site.

Use Sioona to reconstruct signals from source evidence, have people mark them correct or incorrect, and measure Signal Score before deciding whether to continue a two-week Shadow Mode pilot. Sioona never sends customer messages. The public endpoints below explain the product; they do not analyze or accept customer exports.

## Sioona developer resources

- [Sioona developer resources](https://sioona.si/developers): public index for the MCP server, Markdown pages, and agent instructions
- [Sioona agent instructions](https://sioona.si/llms.txt)
- [Sioona MCP discovery manifest](https://sioona.si/.well-known/mcp)
- [Sioona Streamable HTTP MCP endpoint](https://sioona.si/mcp)
- [Sioona workflow and import scope](https://sioona.si/how-it-works)
- [Sioona security and human approval](https://sioona.si/security)
- [Sioona sitemap](https://sioona.si/sitemap.xml)

## Sioona endpoint instructions

Fetch any public page with GET and `Accept: text/markdown`, for example `GET https://sioona.si/security`. HTML and Markdown responses include `Vary: Accept`. Unknown page paths return HTTP 404 Markdown with recovery navigation. GET the discovery manifest as JSON and use its remotes URL for MCP. No API key is needed for these public read-only resources.

For MCP, POST each JSON-RPC message separately to `https://sioona.si/mcp` with `Content-Type: application/json` and `Accept: application/json, text/event-stream`:

1. Initialize: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"sioona-reader","version":"1.0.0"}}}`.
2. Send `{"jsonrpc":"2.0","method":"notifications/initialized"}` without an id. Expect HTTP 202 with no body. Include `MCP-Protocol-Version` with the version returned by initialize on subsequent requests. This server is stateless and requires no session id.
3. Discover tools: `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`.
```

### MCP discovery

```sh
curl -sS http://127.0.0.1:3210/.well-known/mcp
```

```json
{"$schema":"https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json","name":"si.sioona/public-content","title":"Sioona Conversation Intelligence public information","version":"1.0.0","description":"Read-only Sioona marketing, pilot, pricing and security information. No customer data or write tools.","websiteUrl":"https://sioona.si","remotes":[{"type":"streamable-http","url":"https://sioona.si/mcp","supportedProtocolVersions":["2025-11-25","2025-06-18","2025-03-26"]}]}
```

## Exact final smoke output

```text
PASS /: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /about: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /how-it-works: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /security: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /pricing: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /contact: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /developers: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /privacy: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS /terms: HTTP, landmarks, metadata, exact canonical, 4 hreflang, OG locales, schema origins and IN/US areas
PASS internal anchors, structured data, user-controlled demo, 21 assets, crawl files, social image, 404
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
PASS all 9 MCP pages match Markdown, exact catalog URLs, untrusted Origin and unpublished-path rejection
PASS exact canonical origin, all security headers and complete Vary tokens; no contact POST sent
```

## Read-only cutover observations

System-resolver checks on October 16 returned the following; HTTPS could not be evaluated because curl also failed DNS resolution. DKIM selector and actual mail provider were not supplied. No records were changed.

```json
{
  "checkedAt": "2026-10-16T03:36:33.984Z",
  "resolver": "system DNS; not a global or authoritative propagation test",
  "records": [
    {
      "name": "sioona.si",
      "type": "A",
      "error": "ENOTFOUND"
    },
    {
      "name": "sioona.si",
      "type": "AAAA",
      "error": "ENOTFOUND"
    },
    {
      "name": "sioona.si",
      "type": "MX",
      "error": "ENOTFOUND"
    },
    {
      "name": "sioona.si",
      "type": "TXT",
      "error": "ENOTFOUND"
    },
    {
      "name": "_dmarc.sioona.si",
      "type": "TXT",
      "error": "ENOTFOUND"
    },
    {
      "name": "www.sioona.si",
      "type": "CNAME",
      "error": "ENOTFOUND"
    },
    {
      "name": "app.sioona.si",
      "type": "A",
      "error": "ENOTFOUND"
    }
  ],
  "dkim": "Unknown selector and mail provider; not queried or verified"
}
```

## Temporary server shutdown

Stopped the standalone launcher with SIGINT (exit 130). A subsequent loopback fetch returned `ECONNREFUSED` on port 3210, confirming the temporary server no longer responds. No other process was stopped.
