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

## Existing-design polish — 12 October 2026

Branch: `codex/website-design-polish`. Base: `90625f2`.
The discarded `codex/website-design-revamp` branch was deleted at the user's request. All tracked and new task files are inside `site/`; the pre-existing `.cursor/permissions.json` remains untouched.

The original hero, product workspace, teal accent, export overview, signal cards, scroll workflow, score, feature grid, security section, FAQ and closing CTA are preserved. This pass refines hierarchy, spacing, button proportions, card radii, layered depth and narrow-screen layout. Inspiration came from the product-first presentation of Linear and Fin, without importing their assets or adding unsupported customer claims.

Behavior improvements:

- The illustrative hero starts with a complete, paused frame and labels its synthetic data. Playback is user-controlled; its timer stops when paused, offscreen, or reduced motion is requested. Controls use inline SVG icons and accurate accessible playback state.
- FAQ panels follow the URL hash, including hydration, Back/Forward and close. Buttons remain labelled and linked to their regions.
- Reduced-motion users receive a compact workflow with all step descriptions, instead of a long scroll sequence. Clicking a step updates its illustration directly.
- Signal quotes and FAQ answers remain readable without JavaScript. The illustrative score renders 84% immediately instead of depending on a count-up effect. The score gauge and bars retain static no-JavaScript fallbacks.
- The homepage has a focused title and description, canonical URL, Open Graph/Twitter metadata and SoftwareApplication structured data. Existing FAQ structured data, sitemap and robots routes remain intact.
- The unresolved jsdom 29 dependency was replaced with published jsdom 27.0.1, including its lockfile, so navigation tests run reproducibly. Use a supported Node LTS runtime for CI/deployment; the local Node 23 runtime emitted an ESLint dependency engine warning during install.

Verified on the final production build:

- `npm test`: 21 tests across 6 files passed. New regressions cover paused playback, timer cleanup, reduced-motion playback, FAQ deep links/history and labelled panels. Existing navigation, bounded input and mocked intake tests also pass.
- `npm run lint`: passed with no warnings, including the design-token guard.
- `npm run typecheck`, `git diff --check`, and `npm run build`: passed. All marketing routes and crawl/share assets built successfully.
- `node scripts/verify-production.mjs http://127.0.0.1:3101`: passed. Checks five routes, one H1/main per page, SEO metadata, internal anchor targets, schema, 16 static assets, sitemap/robots/social image and a real 404 response. This is a local, read-only check.
- Browser: document width matches viewport at 320, 390, 768, 1440 and 2560 pixels. Desktop/mobile screenshots were inspected. Product dropdown opens and Escape closes it with focus restored. Mobile dialog closes on Escape and restores focus to Open Menu. Demo play/pause and FAQ keyboard/history interactions pass, with no captured browser errors or warnings.
- Contact form: empty submission shows three invalid fields, announces the error count and focuses Name. No request was sent to an external intake service.
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities. The full audit reports 12 development-tool advisories (3 moderate, 7 high, 2 critical); these remain unresolved. Do not treat the production-only audit as a clean audit of the build/test toolchain.

Local preview: http://127.0.0.1:3101/ . No commit, push, merge or deployment was performed.

Deployment readiness limits: the optimized build is ready for a deployment review, but hosted intake configuration and durable receipt, deployed canonical URL, production performance with CPU/network throttling, Safari/iOS Low Power Mode, and an actual browser reduced-motion/no-JavaScript run have not been certified. Timer tests and CSS/static-render fallbacks provide local coverage for those modes; they do not replace device testing. Complete hosted intake verification through a separately approved action before claiming the lead funnel is live.

Safari verification was attempted through the native app, but the computer-use capture service could not start its screen stream. No Safari result is claimed.

## Footer and hero entrance refinement — 12 October 2026

On `codex/website-design-polish`, strictly inside `site/`:

- The footer now uses a high-contrast solid Sioona mark, a larger wordmark, hairline dividers and a responsive masthead. Its labelled home link, three navigation groups and conversion links remain server-rendered and keyboard accessible. Hover rotation applies to an HTML wrapper, rather than transforming the SVG.
- `HeroPreview` observes a stable, unanimated outer frame with `amount: "some"`. Any intersection triggers a one-time opacity/translate/scale entrance, including tall mobile frames and restored scroll positions. It stays entered when leaving the viewport, respects reduced motion, and reveals on keyboard focus. The demo retains explicit play/pause controls and never autoplays.
- Regression coverage checks frame-trigger configuration, reduced motion, keyboard reveal, footer semantics and navigation. All 26 tests in 8 files pass, along with lint, design-token checks, TypeScript, diff whitespace checks and the optimized production build.
- Production smoke checks pass for all five marketing routes, SEO titles/descriptions/canonicals, Open Graph/Twitter tags, SoftwareApplication and FAQ schema, internal anchors, 16 assets, crawl/share files and 404 handling. The footer introduces no duplicate H1 or unnecessary image requests.
- Browser checks: entrance observed at 320, 390, 768, 1440 and 2560 pixels with a 740px viewport height. At 320px the preview is taller than the viewport and still reveals on scroll. A 320 × 640 reload at scrollY 640 preserves scroll position and reveals the preview. No captured browser errors/warnings. Footer inspected at desktop and mobile widths; no document overflow at 320px and the narrow layout uses two navigation columns.

The local preview remains http://127.0.0.1:3101/ . No deploy, push or commit was performed. The hosted-intake, device/browser certification, production performance and development-tool advisory limits recorded above still apply; local build success is not hosted certification.

## Scroll-triggered continuous playback — 12 October 2026

At the user's request, the hero demo now starts on first preview entry and continues looping until the user pauses it, including after scrolling away. This supersedes the earlier paused-by-default and offscreen-pause behavior for the hero. The light pause/play button has a 44px target, a dark icon, visible focus and accurate accessible state. Reduced-motion preferences still stop the loop and display a complete static frame.

The entrance and demo share their trigger. A passive scroll/resize/pageshow fallback checks the stable frame's top boundary once per animation frame until entry, then removes its listeners. It handles fast scroll jumps that skip IntersectionObserver. Tests cover this edge case, repeated full cycles, pause/resume, and reduced motion. Browser checks confirm running playback at 320, 390, 768, 1440 and 2560px, continuous playback offscreen, pause and keyboard resume. Actual browser progress advanced from step 6 to step 2 after resume; no captured console errors/warnings or horizontal overflow.

The hero-badge-label uses the exact #ff6308 brand token. Its dark pill preserves small-text contrast; the pause button remains light. Computed browser values confirm rgb(255, 99, 8) for the badge and rgb(255, 255, 255) for the button background.

All 29 tests in 8 files, lint/token checks, TypeScript, diff checks, production build and read-only route/SEO/asset smoke checks pass. Changes remain inside site; no deployment or Git publication was performed.
