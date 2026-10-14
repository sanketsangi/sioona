# Sioona Marketing Site

Public marketing site for Sioona. A standalone Next.js App Router app, separate from `web/` (the product) and `backend/`.

Stack: Next 16, React 19, Tailwind 3, TypeScript, `geist`, `framer-motion`, `@phosphor-icons/react`.

## Run

```bash
cd site
npm install
npm run dev        # http://localhost:3000
npm run lint       # eslint + design-token guard
npm run typecheck
npm test
npm run build
npm start -- --hostname 127.0.0.1 --port 3101
# In another terminal, against that local production server:
npm run test:smoke -- http://127.0.0.1:3101
```

Environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Required production canonical origin for metadata, sitemap and OG. Accepts a custom HTTPS origin or `https://sioona-site.vercel.app`; development falls back to `http://localhost:3000`. |
| `NEXT_PUBLIC_APP_URL` | Target of the Sign In link. Falls back to `/contact` until the product URL is confirmed. |

## Structure

```
src/
  app/                     Routes: /, /about, /how-it-works, /security, /pricing, /contact
    api/contact/route.ts   Stub handler for the pilot form (validates only, stores nothing)
    llms.txt/route.ts      Public product summary and agent instructions
    template.tsx           CSS-only route fade
    sitemap.ts, robots.ts, icon.svg, not-found.tsx
  middleware.ts            Markdown when Accept prefers text/markdown, including a 404; Vary: Accept on every response
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

`POST /api/contact` validates the payload and returns `{ ok: true }` or `422 { errors }`. **It does not store or send anything.** The success state says so (`contactStub` in `src/lib/site.ts`). Wire it to the real intake before launch, then set `contactStub = false`.

## Deploy To Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `site`. Framework preset: Next.js.
3. Add `NEXT_PUBLIC_SITE_URL` using the custom production origin or the approved stable origin `https://sioona-site.vercel.app`, plus `NEXT_PUBLIC_APP_URL` when the product sign-in URL is confirmed.
4. Deploy. No other configuration is needed.

Unfinished contact requests stay in memory only. Internal links and app Back/Forward
navigation ask before discarding inputs; browser unload retains its native warning.
Menu previews start paused and expose Play/Pause; hidden pages and inactive menus
suspend playback. The hero also suspends when outside the viewport.
