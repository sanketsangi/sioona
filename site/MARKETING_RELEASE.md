# Marketing design review — 10 October 2026

Branch: `codex/marketing-market-ready`. Base: `b432400`.

## Review and implementation

Reviewed the live home page at https://sioona-site.vercel.app/ against the local route structure, shared styles, navigation, product demonstrations, contact form and intake handler.

- Replaced the generic hero with a centered editorial composition, a teal accent, clear pilot benefits and a framed product workspace.
- Removed the live site's placeholder customer-logo strip. Named export sources accurately describe the existing upload workflow without implying endorsements or live integrations.
- Replaced blurred, scroll-dependent problem copy with readable server-rendered content and a semantic heading.
- Applied shared canvas, panel, typography, control and focus tokens across home, pricing, security, workflow and contact pages.
- Kept product demonstrations illustrative. The hero demo starts paused with a complete frame and includes a screen-reader explanation.
- Added a generated 1200 × 630 social preview and large Twitter card. The canonical fallback now uses the supplied production domain instead of localhost. Set NEXT_PUBLIC_SITE_URL when using another production domain.

## Verification

- `npm run lint`: passed, including design-token guard.
- `npm run typecheck`: passed.
- `npm test`: 10 existing tests passed (bounded JSON and contact API).
- `npm run build`: passed with the default Turbopack build; all five marketing routes and the social image prerendered successfully. The initial sandboxed build stalled; stopping that task's process and running with process permissions resolved it.
- Browser: home inspected at 390, 1280 and 1440 pixels; no horizontal document overflow at those widths. Pricing, security and how-it-works rendered with correct titles/headings and no document overflow at inspected desktop widths.
- Browser: mobile menu opens, Escape closes it and focus returns to its trigger. Empty contact submission marks the three required inputs invalid and focuses Name.

## Release conditions still requiring hosted evidence

The code is build-ready. Production intake and full production performance are not certified by local checks.

1. Verify production PILOT_INTAKE_BACKEND_URL and SIOONA_SERVICE_TOKEN are configured server-side; the existing API returns 503 without them. Confirm a separately authorized synthetic submission persists and returns its matching receipt. No external submission was made during this task.
2. Confirm the team monitors stored requests and has an approved privacy notice for collecting contact information. This change does not invent privacy or contractual promises.
3. Verify the deployed canonical domain, social image, mobile pages and intake recovery behavior. Run production Lighthouse and Safari/reduced-motion checks before declaring a broad market launch; no measured performance or accessibility score is claimed here.

The redesign is committed on `codex/marketing-market-ready`. No merge or deployment was performed. Hosted intake verification remains outstanding.
