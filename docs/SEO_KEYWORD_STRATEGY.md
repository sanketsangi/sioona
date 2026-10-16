# Sioona B2B keyword strategy

Updated 16 October 2026. Markets: India and the United States; shared English pages.

This map is based on the product’s published capabilities and buyer intent. Search volume, CPC, keyword difficulty, current rankings and conversion uplift are **unknown**. No paid keyword API or model call was made. The priorities below are product-fit hypotheses, not measured demand. Use Search Console impressions and reviewed search results to validate them.

## Positioning and conversion

Sioona helps B2B customer teams review lead, retention and upsell signals from existing customer chats. The offer is a two-week Shadow Mode pilot from one redacted export, with scope and price agreed before the pilot. The conversion is a qualified pilot enquiry, not an automatic purchase. Follow-up stays with the customer’s team. Do not imply autonomous outreach, guaranteed churn reduction, live Intercom/WhatsApp integrations, public list pricing or unverified certifications.

## Route and intent map

| Canonical route | Primary target | Supporting queries | Intent and buyer | Content and next step |
| --- | --- | --- | --- | --- |
| `/` | B2B conversation intelligence | customer conversation intelligence; revenue signals from customer chats | Commercial evaluation by CS, sales and operations leads | Explain source evidence, retention/lead/upsell signals and human review; link workflow, security and pilot request |
| `/about` | human-led conversation intelligence | customer churn signal detection; customer retention signals; upsell opportunity detection; buying intent in customer chats | Informational to commercial; teams deciding product fit | Explain use cases and boundaries; link chat export analysis and pricing |
| `/how-it-works` | Intercom chat export analysis | WhatsApp Business chat analysis; analyze Intercom JSON; CSV conversation analysis; human-in-the-loop AI review; Shadow Mode AI | Task-based informational and product evaluation | Give export preparation and review steps, supported formats and follow-up boundary; link security and contact |
| `/security` | conversation intelligence data security | AI review safety; chat data handling; human-in-the-loop AI controls | Procurement and operational evaluation | Explain redaction, stored data and pilot agreements; link privacy and enquiry |
| `/pricing` | conversation intelligence pilot pricing | conversation intelligence pilot cost; customer chat analysis pilot | High-intent commercial | State two weeks, one redacted export, agreed scope and price, no invented free plan; link pilot request |
| `/contact` | request conversation intelligence pilot | Sioona demo request; Shadow Mode pilot | Transactional, qualified business enquiry | Describe next steps; preserve form validation and stored-receipt flow; never request transcripts here |
| `/developers` | Sioona MCP server | conversation intelligence developer resources; Sioona Markdown; Sioona AI search | Branded technical discovery | Document public read-only tools and boundaries; link MCP discovery, llms and security |
| `/privacy` | Sioona pilot request privacy | Sioona contact data deletion; pilot enquiry privacy | Branded due diligence | Explain actual contact-data handling and separate export agreements; link contact |
| `/terms` | Sioona pilot request terms | Sioona pilot scope and pricing terms | Branded due diligence | Explain discussion versus processing agreement and human review; link contact |

Assign the broad commercial phrase to the homepage and export how-to intent to the workflow page. Legal and developer routes serve trust and branded discovery; do not force generic commercial keywords into those pages.

## Content implemented

- All nine public routes have distinct absolute titles of 35–60 characters and descriptions of 120–158 characters. These are editorial constraints, not a guarantee Google displays the supplied snippet.
- About explains retention risk, buying intent and upsell review with links into the workflow and pilot offer.
- The workflow has an Intercom/WhatsApp export-analysis section with preparation, human review and follow-up instructions. HTML and negotiated Markdown share these additions.
- Each route has one h1, hierarchical subheadings, canonical metadata and a breadcrumb. Privacy and terms have descriptive h2 sections.
- Shared entity graph: Organization, WebSite and Service. The homepage also describes SoftwareApplication, Product and HowTo; workflow repeats the visible HowTo. No invented reviews, ratings or prices.
- `en-IN`, `en-US`, `en` and `x-default` reference the same English canonical URL. There are no localized regional versions or geo redirects. Revisit these annotations if genuinely localized pages are published.
- Robots, sitemap and llms expose the canonical pages and developer resources. Crawler permission and llms do not guarantee search indexing, AI citations or rankings. IndexNow is an independent verified-key submission protocol, not a robots directive.

## Prioritized next opportunities

| Priority | Opportunity | Evidence needed before expanding | Decision |
| --- | --- | --- | --- |
| 1 | Improve pages already receiving relevant impressions | GSC query/page/country rows with at least 50 impressions and average position 5–20; inspect actual search results | Use the audit runner’s opportunities. Review intent and current page before changing copy |
| 2 | Dedicated customer retention / churn signals guide | Relevant GSC impressions or independently verified demand; source-backed examples and a reviewer | Existing About use-case section is the starting point; publish a separate guide only when it answers a distinct question |
| 3 | Detailed Intercom and WhatsApp export walkthroughs | Confirm current export formats, redactable examples, current provider instructions and task-specific demand | The workflow covers preparation now; avoid thin duplicate pages for each tool |
| 4 | Upsell and lead discovery examples | Redacted/synthetic examples clearly labelled, reviewed signal evidence and actual buyer questions | Expand accurate examples; never imply synthetic examples prove customer revenue |

No new public routes are introduced by this upgrade. Do not create comparison, location or “free analyzer” pages without supported content and an actual product flow.

## Measurement and review

1. Configure the read-only GSC account and exact property using `ops/seo/README.md`. Run the audit and retain private JSON outside version control.
2. Separate India (`ind`) and US (`usa`) query/page observations. The runner returns country dimensions and does not combine query variants into an invented demand total.
3. Compare the last complete 28-day window against a comparable earlier period after publication; note launch date, seasonality and indexing changes. Average position is not an exact live rank.
4. Review impressions, clicks and CTR alongside qualified enquiries and source-evidence quality. Do not assume every impression is a buyer or invent a conversion rate.
5. Recheck the live domain’s canonical URLs, robots access, schema contracts and mobile PageSpeed. CrUX may have no field data for low-traffic origins.
6. Run the SEO gate on every site change: Vitest plus the rendered-build audit. Review the manual schema-validator result separately from contract tests.

## References and limits

- [Google localized-version guidance](https://developers.google.com/search/docs/specialty/international/localized-versions): language/region alternate annotations.
- [Search Console query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query): first-party query/page data has reporting limits and omitted queries.
- [Schema.org SoftwareApplication](https://schema.org/SoftwareApplication): entity semantics; schema validity is separate from rich-result eligibility.
- [Google HowTo and FAQ changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes): HowTo markup does not produce Google HowTo rich results, and FAQ rich results have restricted eligibility.

This is an implemented intent map with a measurement path. It is not evidence of ranking growth or a paid keyword-market analysis.
