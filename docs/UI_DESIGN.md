# Sioona UI Design Guide (Vercel Style)

## Goal

The product should feel like a calm, modern infrastructure/product dashboard:
clear, minimal, trustworthy.

## References

- Vercel dashboard aesthetic
- shadcn/ui defaults
- Geist typography
- Neutral enterprise SaaS, not flashy AI consumer apps

## Principles

1. Clarity over decoration
2. Consistency over novelty
3. Quiet confidence over visual noise
4. Fast scanning for operators reviewing signals

## App shell (sidebar-07)

Shell uses shadcn Sidebar primitives (`SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger`, `SidebarRail`) with `collapsible="icon"`.

- **Tokens:** `--sidebar-*` (and related shadcn HSL channels) alias to sio neutrals in `globals.css` — light theme / `color-scheme: light`; do not invent a second palette.
- **Width:** `--sidebar-width: 240px`; icon rail `--sidebar-width-icon: 3rem` (Tailwind uses `w-[var(--sidebar-width)]`).
- **Brand:** `SioonaLogotype` + compact “S” mark in the sidebar header (no Acme `TeamSwitcher`).
- **Nav:** Workspace — Insights, Upload, Eval, Taxonomy via `viewHref` / Phosphor + local icons; Help / Guidance disabled; Create Account stub (no fake user avatars / Auth0).
- **Header:** existing `AppHeader` title + mode toggle + actions; `SidebarTrigger` for desktop collapse and mobile sheet.
- **Out of product:** do not ship the sidebar-07 demo dashboard as the home route.

## Concrete rules

- Font: Geist
- Radius: small/medium only
- Shadows: minimal or none
- Borders: subtle
- Accent: one only
- Spacing: generous but disciplined
- Density: medium (ops-friendly)

## Key screens

- Insights overview
- Signals queue (User column shows customer name)
- Signal detail + conversation preview (customer name in header + transcript labels)
- Eval / Signal Score

### Signal Score chrome

- **Full** (`SignalScoreSummary`): stacked header + overall cell + by-type column (Eval overview when not compact).
- **Compact** (`compact` on Eval strips): single `.metric-strip--compact` block — eyebrow + Overall % + Reviewed/Correct + type chips inline; tight padding (~70–90px vs ~175px stacked). Neon SoT unchanged. Signal Detail omits the score strip (score lives on Insights/Eval).

### Conversation transcript (alignment lock)

Shared chrome: `ConversationMessages` → local `Message` + `Bubble` (geistcn/shadcn-aligned API; no fake `/avatars/*.png`). Used as the full list in `ConversationDrawer` (Insights + Detail).

| Role | Side | Bubble | Avatar |
|---|---|---|---|
| Customer (`role !== agent`, not system) | **Right** of the conversation container | Quiet muted (`sio-bg-muted`) | Initials |
| Agent | **Left** | Primary-quiet (`sio-bg-subtle` + inset ring) | Desktop (computer) icon |
| System | Centered label | None | None |

**Implementation lock (do not regress):**
- Each `Message` row is `w-full`. End-aligned rows use `flex-row-reverse` + `justify-start` so the bubble+avatar group packs to the **right**; start rows pack to the **left**. Do not rely on shrink-wrapped `ms-auto` alone — that leaves the group on the left while only swapping avatar/bubble order.
- `MessageContent` / bubble max-width: `min(24rem, calc(100% - 2.5rem))` with `min-w-0` + `break-words` so long text wraps on mobile without overflowing.
- Tokens: `sio-*` only; quiet fills; no glass, neon, or heavy shadows.

### Signal Detail (single viewport)

Detail must fit a typical laptop viewport without scrolling the main page: header row (Back + **Open Conversation**) and a single full-width column for signal + feedback in `min-h-0` flex children (no Signal Score strip — that lives on Insights/Eval). Signal card is dense (clamped summary, short Suggested Next Action, ≤2 Why This Fired lines) so evidence is not repeated three ways. No inline Conversation panel or message teaser — full transcript is drawer-only. When there are no messages (or Neon stub), omit the button and show a short honesty note in the header (“No messages stored” / “No local conversation”); never invent chat.

### Conversation drawer (Insights + Detail)

Shared `ConversationDrawer` → local `Drawer` shim. Insights preview keeps summary + evidence quote + status and opens with **See Conversation**; Signal Detail places **Open Conversation** in the top header action row (next to Back). Full transcript scrolls inside the drawer (not inline). Summary / type stay on the preview/detail surface.

- **Header:** visible quiet title **Conversation** (`DrawerTitle`) + optional customer subtitle (`DrawerDescription`, `translate="no"`, truncate). Dialog uses `aria-labelledby` on the title (not `aria-label` alone). Close lives in the header row (not absolute overlay); Escape, backdrop click, and focus return to the trigger unchanged.
- **Layout:** shrink-0 header + flex-1 scroll body (`overscroll-behavior: contain`, safe-area on bottom / desktop top) + optional footer. Header/body/footer share horizontal inset `px-6` (24px) and a centered `max-w-md` content column so wide bottom sheets keep calm side gutters (bubbles/chrome don’t flush to the panel edge); vertical header/footer `py-2`. Same message alignment lock as above (customer right / agent left); identity via avatar only — no per-message name/**Agent** labels; no StatusDot on messages.
- **Chrome:** desktop (`md+`) narrow right sheet `width: min(100%, 28rem)`, border-left only, radius 0; mobile bottom sheet `max-height: ~85dvh`, modest top radius (~12px), compact swipe handle. Panel `bg-sio-bg-base` + `sio-border-base`; backdrop `--sio-bg-overlay`; honor `prefers-reduced-motion`.
- **Empty:** same honesty as Neon stubs — “No messages stored” (no invented transcript).
- **Footer:** Insights only — **Open Full Detail** / **Add Feedback** → existing detail href (dense `px-6 py-2`, buttons `h-9` on `md+`). Detail omits footer (already on the page). No toast.

### Insights queue status

Operator-facing status chrome via `SignalStatus` → `StatusDot` (`web/src/components/ui/StatusDot.tsx`, geistcn-aligned local shim). **Pending until review = blue**; colors follow the operator feedback label after review (not signal type). Mapping lives only in `format.ts` (`signalStatusDot`).

| Operator state | Label | Dot |
|---|---|---|
| Pending (no feedback yet) | **Pending** | Blue (`ds-blue` / sio link) — QUEUED |
| `feedback.label === correct` | **Correct** | Green (`sio-status-success-*`) — READY |
| `feedback.label === incorrect` | **Incorrect** | Red (`sio-status-danger-*`) — ERROR |
| `feedback.label === partially_correct` | **Partially Correct** | Orange/amber (`sio-status-warning-*`) — BUILDING |

URL filter stays `status=new` for the Neon needs-review bucket. StatusDot uses **feedback presence/label** once reviewed (so a reviewed row never stays Pending/blue from a stale `status===new`). Always show the text label with the dot (color is not the only cue). Do not use signal-type colors (lead/retention/upsell) for status.

### Signal chrome (reuse lock)

Operator Insights surfaces (queue / preview / detail) share one chrome set — copy the locked queue look; do not re-wire icons or status mapping in views.

| Surface | Component | Notes |
|---|---|---|
| Status | `SignalStatus` only | Internals call `signalStatusDot` → `StatusDot`; Pending / Correct / Incorrect / Partially Correct mapping stays in `format.ts` |
| Detection score | `SignalScoreChip` only | Hairline pill + band icon hex; bands unchanged via `scoreIconKind` / `scoreIconColor` |
| Type (ops scan) | `SignalTypeChip` | Same hairline pill + muted Lead / Retention / Upsell glyphs |
| Type (taxonomy / legacy colored mark) | `SignalBadge` | Colored mark for taxonomy tables only — do not duplicate chip logic inside `SignalBadge` |
| User | `SignalUser` | `Avatar` + initials (`?` when empty / `"Customer"`) + optional truncated name |

**NEVER** re-wire `scoreIconKind` / `StatusDot` mapping / type icons inline in views — import the shared components.

Shared pill class: `signalChipClass` (exported from `SignalScoreChip.tsx`).

### Insights queue Type chip

Queue **Type** column uses `SignalTypeChip`: pill radius (`rounded-full`), white/base fill, hairline only (`shadow-[0_0_0_1px_rgba(0,0,0,0.08)]` — no elevation), type glyph (`LeadIcon` / `RetentionIcon` / `UpsellIcon`, muted) + Title Case label. Preview + detail use the same chip for ops scan consistency.

### Insights queue Score chip

Queue **Score** column uses `SignalScoreChip` (same `signalChipClass` hairline pill as Type): band icon + tabular digits (`formatScore`) side by side. Bands on `signal.score` (0–1) via `scoreIconKind` / `scoreIconColor` (inline `color` on `GeistMaskIcon`) — only inside `SignalScoreChip`:

| Score | Display | Icon | Hex |
|---|---|---|---|
| `< 0.5` | `< 50` | `StopIcon` (`stop.svg`, solid octagon) | `#d8001b` |
| `0.5`–`0.9` | `50`–`90` | `WarningIcon` (`warning.svg`, solid triangle) | `#ff9300` |
| `> 0.9` | `> 90` | `GoodIcon` (`good.svg`, check-in-circle) | `#279141` |

Preview + detail use `SignalScoreChip` too. Not StatusDot / feedback colors.

### Insights queue Evidence density

Desktop queue shows Evidence (quote only, truncated) from `lg+`. Between `sm` and `lg`, columns are User · Signal · Status · Score · Type · Action (no Evidence). Mobile stacked cards keep a single evidence quote line. Do not show `Next · suggestedAction` under Evidence in the queue; suggested action stays on preview/detail.

### Insights summary display (no name echo)

When the customer name is already shown (queue User column, preview name line), display summary via `queueSignalSummary(summary, customerName)` — strip a leading name + optional `(channel)`, trim leftover dashes/colons, capitalize the remainder. Fall back to the original summary if strip would empty. Do **not** change `detect.ts` / stored summaries. Preview panel uses the same helper as the queue Signal column.

## Showcase corpus names

`testing.json` encodes people in `externalId` (`rahul_mehta_29`). The loader derives `customerName` for store + detect summaries; FastAPI dual-write carries the name inside `summary` (no separate Neon customer column). UI strips the name prefix for display only (`queueSignalSummary`).
