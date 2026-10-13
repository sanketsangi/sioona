# Sioona Marketing Site

Public marketing site for Sioona. A standalone Next.js App Router app, separate from `web/` (the product) and `backend/`.

Stack: Next 16, React 19, Tailwind 3, TypeScript, `geist`, `framer-motion`, `@phosphor-icons/react`.

## Run

```bash
cd site
npm install
npm run dev        # http://localhost:3000
npm run lint       # eslint + design-token guard
npm run build && npm start
```

Environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata, sitemap and OG. Production is `https://sioona-site.vercel.app`. If unset, falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then `https://sioona-site.vercel.app`. |
| `NEXT_PUBLIC_APP_URL` | Target of the Sign In link. Falls back to `/contact` until the product URL is confirmed. |
| `PILOT_INTAKE_BACKEND_URL` | Server-only FastAPI origin. The browser never sees this. |
| `SIOONA_SERVICE_TOKEN` | Server-only bearer token sent to FastAPI. Must match the backend token. |

## Structure

```
src/
  app/                     Routes: /, /how-it-works, /security, /pricing, /contact
    api/contact/route.ts   Validates the pilot form and stores it through FastAPI
    template.tsx           CSS-only route fade
    sitemap.ts, robots.ts, icon.svg, not-found.tsx
  components/
    layout/                Logo, SiteNav (native <dialog> drawer), Footer
    sections/              One file per home section
    mocks/                 InsightsMock + useInsightsScript (scripted hero loop)
    signal/                SignalTypeChip, SignalScoreChip, SignalStatus, SignalUser
    motion/                Providers (LazyMotion + MotionConfig), Reveal helpers
    forms/ContactForm.tsx  Accessible pilot request form
    ui/                    ButtonLink, SectionHeader, PageHeader
  lib/                     motion.ts, site.ts, contact.ts, faq.ts, steps.ts, tokens.ts
  styles/tokens.css        --ds-* primitives mapped to semantic --sio-* tokens
scripts/check-tokens.mjs   Lint guard for the design system
```

### Design tokens

Components bind to `--sio-*` only. `tailwind.config.js` replaces the default palette, so only `sio-*` colors exist. `npm run lint` fails on hex/rgb/oklch literals, raw `--ds-*` references, default Tailwind palette classes and `transition-all` outside `styles/tokens.css` and `lib/tokens.ts`.

## Motion

All timing lives in `src/lib/motion.ts`: `ease`, `duration`, `stagger`, `distance`, `viewport`, shared variants (`fadeUp`, `fade`, `pop`, `staggerContainer`) and `heroScript` (the hero mock timeline).

- `MotionProviders` wraps the app in `LazyMotion` (`domAnimation`, strict) and `MotionConfig reducedMotion="user"`.
- Only `transform` and `opacity` animate (plus a short `filter: blur` in the statement section).
- Entrances use `whileInView` with `once`. Scroll-linked sections use `useScroll` and `useTransform`.
- The hero entrance and route fade are CSS only, so server-rendered content never waits on JavaScript.
- The marquee is CSS only and has a pause control.
- The hero mock pauses off-screen (IntersectionObserver), on hover and via a pause button.
- With `prefers-reduced-motion`: the hero mock shows its static final frame, the statement is plain text, the marquee is a static row, and transitions collapse.

To change pacing, edit `motion.ts` (and `heroScript` for the mock) rather than individual components.

## Contact form

The browser posts JSON to `POST /api/contact` with an `Idempotency-Key` of 16–64 letters, digits, underscores, or hyphens. The route trims fields and returns `422 { errors }` for invalid input. It does not call the backend for those requests.

When `PILOT_INTAKE_BACKEND_URL` and `SIOONA_SERVICE_TOKEN` are set, a valid request is forwarded server-side to `POST /v1/pilot-requests` with `Authorization: Bearer` and the same idempotency key. Success is `{ ok: true, receipt }` only when the backend echoes that key as `receipt`. The receipt is the primary key of the stored `pilot_requests` row. Sending the same key and payload again returns the same receipt and does not insert a second row.

If either server variable is missing, or the backend does not confirm the receipt, the route returns `503` and does not claim the request was stored. The response never includes the service token. A local `200` is not evidence that production stored the row.

## Deploy To Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `site`. Framework preset: Next.js.
3. Set production `NEXT_PUBLIC_SITE_URL` to `https://sioona-site.vercel.app`. `NEXT_PUBLIC_*` values are inlined at build time, so changing the origin requires a new deployment.
4. Set production `PILOT_INTAKE_BACKEND_URL` and `SIOONA_SERVICE_TOKEN` to the same FastAPI origin and service token the product app uses. These stay server-only.
5. Deploy. Confirm canonical URLs, `sitemap.xml`, and `robots.txt` on the production alias, then submit one synthetic pilot request and read that receipt back from `pilot_requests`.
