# Search ownership and IndexNow

This code prepares the site for accounts created by the operator. It does not create accounts, verify provider ownership, change DNS, deploy, subscribe, submit a sitemap or notify search engines automatically.

## Configure ownership codes

The optional `site/.env.example` fields are:

- `GOOGLE_SITE_VERIFICATION`: content value of Google's HTML verification tag, for a URL-prefix property. A domain property such as `sc-domain:sioona.si` instead needs Google's supplied DNS TXT record.
- `BING_SITE_VERIFICATION`: content value for `msvalidate.01`.
- `AHREFS_SITE_VERIFICATION`: content value for `ahrefs-site-verification`.
- `INDEXNOW_KEY`: operator-generated 8–128-character key using letters, digits or dashes. The same value must be present in the site runtime and submission shell.

Paste only the verification content value. OAuth secrets, service tokens and API keys do not belong in these fields. Empty values emit no placeholder metadata. Set real values through the approved environment/deployment workflow; the three HTML tags require a rebuild. No environment file is automatically loaded by the Node CLI: export `INDEXNOW_KEY` in your shell or use your approved secret manager. Keep local env files ignored.

The runtime serves the IndexNow key as UTF-8 plain text at `/indexnow-key.txt`. It returns 404 when unset, prevents caching, and carries `X-Robots-Tag: noindex, nofollow`. The endpoint supports IndexNow's explicit `keyLocation` option and is outside the sitemap. It has no POST handler and never sends a notification. The ownership proof is intentionally retrievable; it is not an application authentication credential.

## Read-only checks

```sh
npm --prefix tools/seo test
npm --prefix tools/seo run verify
npm --prefix tools/seo run readiness -- --origin https://sioona.si
npm --prefix tools/seo run indexnow -- --origin https://sioona.si
```

`readiness` GETs the sitemap and public pages and checks status, exact canonical, unique metadata bounds, one H1, ownership-tag presence and the key endpoint. With local `INDEXNOW_KEY` set, it compares the served key without printing either value. Missing optional account configuration is `pending`; `--strict` treats pending checks as a failure. Provider account verification and actual indexing remain unknown even when all checks pass.

For an already-built local production server:

```sh
npm --prefix tools/seo run readiness -- --origin https://sioona.si --url http://127.0.0.1:3227
NEXT_PUBLIC_SITE_URL=https://sioona.si node site/scripts/verify-production.mjs http://127.0.0.1:3227
```

The second command covers all public metadata/graphs, robots/sitemap, instructions, HTML/Markdown negotiation and public MCP behavior. The canonical audit runner is `node ops/seo/audit-site.mjs`; set `SEO_BASE_URL` and optionally `SEO_LIGHTHOUSE=true` as described in `ops/seo/README.md`. Reports are ignored local evidence, not indexing or ranking assertions.

## Deliberate submission after publishing

First inspect the preview from `npm --prefix tools/seo run indexnow`. It reads the live canonical sitemap, removes non-HTML resources such as `/llms.txt`, rejects private/cross-origin/query/fragment URLs and prints no ownership-key value. It sends no notification.

Only after the real key is deployed, the release is live and the URL list is approved, an operator may execute:

```sh
npm --prefix tools/seo run indexnow -- --origin https://sioona.si --submit
```

This explicit action verifies the key endpoint and each current page's HTTP 200/exact canonical, then POSTs one bounded batch to `https://api.indexnow.org/indexnow`. Redirects are rejected; requests time out and responses are size-bounded. No cron, build hook, contact flow or client-side action submits. There is no automatic retry. HTTP 200 means received; 202 means received with key validation pending. Neither proves indexing or ChatGPT citation. This initial tool covers current sitemap URLs; it does not notify deleted URLs.

Google sitemap submission and URL Inspection remain manual account actions or separately authorized connector operations. This integration does not call Google's Indexing API or promise immediate indexing. Ahrefs and Bing account status must be confirmed in their own interfaces.

## Official references

- [IndexNow key files, keyLocation and response codes](https://www.indexnow.org/documentation)
- [Google verification methods](https://support.google.com/webmasters/answer/9008080)
- [Bing HTML verification tag](https://learn.microsoft.com/en-us/bingwebmaster/verifying-wordpress)
- [Ahrefs HTML verification tag](https://help.ahrefs.com/en/articles/1420756-how-to-add-the-html-tag-to-your-wordpress-site-s-homepage-for-ownership-verification)
- [Google recrawl requests and indexing limits](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)

## Browser and DNS reachability gate

```sh
npm --prefix tools/seo exec playwright -- install chromium webkit firefox
npm --prefix tools/seo run reachability -- --origin https://sioona.si --out reports/custom-domain-device-check.json
```

Run this before declaring a custom-domain release reachable. It checks normal system resolution, apex/www A records through Cloudflare/Google/Quad9/OpenDNS, and ordinary HTTPS navigation in desktop Chrome/Firefox, Android Chrome emulation and iPhone WebKit emulation. It never overrides DNS or disables TLS validation. Every browser must reach HTTP 200 at the canonical apex, with one H1 and no horizontal overflow. Missing engines, DNS failures or navigation errors produce exit 1, even if public resolver checks pass. Install failures are not passing device checks. The command needs `dig` (standard on macOS; install the DNS utilities package on Linux).

These profiles share one computer/network. They do not prove physical iOS/Android, mobile carrier, other ISP or geographic reachability, and cannot guarantee that third-party DNS caches never return stale answers. Real-device acceptance still requires opening apex and www on physical iPhone/Android and at least one cellular network independent of the test computer's Wi-Fi. Record browser/network/time and result; do not mark that acceptance complete from emulation. No recurring monitor or deployment hook is installed by this command.
