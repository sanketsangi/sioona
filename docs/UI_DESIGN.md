# Sioona operator workspace design guide

## Goal

The product should feel like a calm, modern infrastructure/product dashboard:
clear, minimal, trustworthy.

## References

- Calm infrastructure dashboard surfaces
- Context beside work, inspectable source evidence, and direct draft editing
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
- **Navigation:** Work (Insights, Uploads, Revenue report), Quality (Evaluation, Signal taxonomy), Administration (Economics, Data lifecycle, visible to verified admins). Groups stay open. Stored view/panel/status identifiers and aliases remain stable. Sidebar account identity comes from server session context; each admin route independently enforces authorization.
- **Context:** Screen links carry known corpus, search, filter, pagination, selection, evaluation-panel and pending-upload context. Corpus switching clears selection/page and explains the scope change. Corpus names include Sample / Partner demo / Uploaded text. Main Insights and brand links only navigate; they do not seed or wipe data.
- **Header:** One screen title, selected corpus, user-operated notifications and Shadow/Action control. Collapsed navigation has accessible names and delayed tooltips. Locked Action remains unselected and announces why it is unavailable. Unlocked Action still uses the existing Follow-up route and never sends externally.
- **Notifications:** New notices update unread counts. The tray opens only on user input; automatic modal opening interferes with keyboard review and is removed.
- **Administration shell:** Economics and lifecycle share `AppShell`, `#main`, and its skip link. Lifecycle keeps verified-admin checks, legal holds, destructive confirmations, fencing, exports and receipts. Policy version and scheduling status come from the lifecycle response. Retention durations are unavailable in that contract and are not hardcoded into the UI. Export expiry and deletion-receipt policy/backup information use returned values; unavailable hold state never means no holds.
- **Out of product:** do not ship the sidebar-07 demo dashboard as the home route.

## Upload (one panel)

Upload Chats body stays inside existing `page-frame` / `ViewFrame` — not a `/login` route and not login-04 page chrome (`min-h-svh`, shadcn `Card`).

- **Panel:** centered Geist `.panel` (`max-w-5xl` ≈1024px; `lg:min-h-[435px]`; full-width below) with `UploadForm`. Heading **Get started with Sioona** (`text-center` at all breakpoints; `translate="no"` on the brand). A short subtitle explains the upload and review journey. Roomy dashed drop zone (`FolderIcon` + native `input type=file` overlay labeled via drop-zone prompt; `min-h-56` + `flex-1` from `lg`; nested `--radius-control`; quiet dashed border) — not a flex-fill strip.
- **Journey:** Choose a file → inspect selected name/size and optional mapping preview → confirm destructive replacement → process → review scoped results. The primary Upload & Detect action stays dominant. One carousel file is submitted at a time. Formats and file/row/message limits use the parser’s shared constants; the server remains authoritative. Preview uses the existing parse-only endpoint for every accepted format.
- **Demo controls:** Secondary demo/reset actions retain production guards. Reset or changing demo packs requires an explicit scope warning and Cancel. An already-active pack navigates without rewriting it. No automatic demo warmup mutation runs from the sidebar.
- **Processing/recovery:** Worker responses show real status and conversation counts. Inline detection is indeterminate. An accepted worker job ID and basename travel in `uploadJob` / `uploadFile` URL context. Resume checking issues GET to the session-scoped jobs endpoint, without reuploading or redetecting. Leaving stops polling, not server work. No cancellation is offered without a cancellation contract. Terminal failure, connection loss and synchronization warnings remain distinct.
- **Errors:** Persistent, in-flow messages near controls; no timed dismissal or absolute error pill. Selected files survive recoverable errors. Failed preview describes parsing/mapping failure without claiming import success. Partial synchronization preserves the existing result/banner semantics and scoped review destination.
- **Help:** Static, keyboard-operated preparation disclosure under the panel. No rotating tips, simulated ETA, or word animation.
- **Layout:** horizontally centered; optically above vertical center (`items-start` + modest `pt-*`). No Partner Sample Pack aside / samples list; no ~60% height strip. Layout is panel + contextual help under the card — **no** cadence helper.

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
- **Compact** (`compact` on Eval Metrics): full-width `EvalCard` matching Insights queue Card chrome — header (eyebrow + window source + This Week / From / Apply Window) · five equal KPI cells in one row (Overall % · Reviewed · Correct · Incorrect · Partial, tabular) · type chips via `SignalTypeChip` + percent, all-time trailing. Header and KPI gutters share `px-3 py-2.5 sm:px-4`. `--radius-panel`, `sio-border-base`. Neon SoT unchanged. Insights in-queue review omits the score strip (score lives on Insights queue chrome / Eval). Labeled Eval / Pilot / offer / Baseline use the same `EvalCard` rhythm.

### Eval / labeled segmented tabs

Shared `SegmentedTabs` (Eval panels + Labeled tables): hairline `sio-border-subtle` track on `sio-bg-base` (matches ModeToggle), sliding thumb (`translateX` via `--seg-index`; transform/opacity only; `sio-bg-interactive` fill). Real `Link`s; active = thumb fill + medium weight (not color-only). Modest `rounded-sm` nested radius — not pills-on-pills. Honor `prefers-reduced-motion` (no slide).

### Conversation transcript (alignment lock)

Shared chrome: `ConversationMessages` → local `Message` + `Bubble` (geistcn/shadcn-aligned API; no fake `/avatars/*.png`). Used as the full list in `SignalReviewConversation` (inline chat well) and `ConversationDrawer`. Supporting evidence jumps add `.chat-bubble--evidence` on the matched bubble.

| Role | Side | Bubble | Avatar |
|---|---|---|---|
| Customer (`role !== agent`, not system) | **Right** of the conversation container | `.chat-bubble--muted` (`sio-bg-muted`, `--radius-panel`) | Initials |
| Agent | **Left** | `.chat-bubble--default` (`sio-bg-base` + `sio-border-base`, `--radius-panel`) | Bot mark (`AgentBotIcon`) |
| System | Centered label | None | None |

**Implementation lock (do not regress):**
- Each `Message` row is `w-full`. End-aligned rows use `flex-row-reverse` + `justify-start` so the bubble+avatar group packs to the **right**; start rows pack to the **left**. Do not rely on shrink-wrapped `ms-auto` alone — that leaves the group on the left while only swapping avatar/bubble order.
- `MessageContent` / bubble max-width: `min(24rem, calc(100% - 2.5rem))` with `min-w-0` + `break-words` so long text wraps on mobile without overflowing.
- Tokens: `sio-*` only via `.chat-bubble*`; `--radius-panel` (same ladder as `.panel`); quiet fills; no glass, neon, or heavy shadows.

### Insights in-queue review (accordion)

Operator review happens **in the queue**, not on a full-page Signal Detail screen. Clicking a row (or **Review**) opens that signal via `?preview=<signalId>` (one open at a time). On a normal laptop the transcript sits beside the review cards (`@container review` `48rem`: rail | fixed **385px** chat, evidence quote highlighted). Narrower panes hide the inline transcript and use the drawer. Phone reviews reuse the queue card for their selected-signal summary; the desktop table is hidden. Long source quotes wrap, and pane headings wrap above secondary controls on phones. Collapsed row cells stay unchanged (User · Signal · Status · Score · Type · Evidence @ lg · Review). Expanded body:

1. **Signal cell (in-row):** row chrome stays identical open or closed — truncated Signal summary (no unwrap, no selected fill / `aria-current` bar). Full text and evidence live in the expand body; no duplicate full-signal block there beyond Supporting evidence.
2. **Supporting evidence** precedes detection feedback and recommended draft actions in both visual and reading order. Exact spans are marked only when persisted quote and offsets reconstruct the stored message; message-only matches say so. Source position and role come from stored messages. Missing/stale sources never become invented quotes. Surrounding transcript remains available.
3. **Feedback** — Correct / Incorrect / Partially correct, optional note, Ground Truth in the header. Feedback, draft approval, clipboard copy, recorded handling and business outcomes remain distinct dimensions.
4. **Recommended draft** — Copy Reply copies to the clipboard; Approve draft records approval; Mark as acted records handling outside Sioona. A Correct detection review is still required to mark handling; the reason appears beside controls. No approval/copy automatically creates Correct feedback. Success follows persistence. Failures keep the selected signal and draft edits. Editing uses Save draft / Cancel; dirty cancellation/document exit is protected, internal links are guarded, and cancellable Back/Forward traversal is guarded where the browser Navigation API supports it. The existing editor remains the surface for inspecting and editing supervised draft text. No regeneration or send capability is added.

Retain the existing review interaction. Animate only user-triggered opacity/transform changes and honor `prefers-reduced-motion`. `grid-template-rows` is a layout property and must not be animated; the former prescription calling it compositor-friendly is withdrawn. Expanded row keeps `aria-expanded` / `aria-controls` / `data-expanded` (no `aria-current` highlight). Legacy `?signal=` and `/insights/[id]` redirect to `?view=insights&preview=<id>`.

### Conversation drawer (Insights)

Shared `ConversationDrawer` → local `Drawer` shim. From review-pane `48rem` the transcript is inline (`SignalReviewConversation`, fixed 385px) with the evidence quote highlighted. Below that, **Open Conversation** and the quote open the drawer.

- **Header:** ops lockup — `SignalUser` (customer initials) + title = customer name (`DrawerTitle`, `translate="no"`) + subtitle **Conversation** and optional message count (`DrawerDescription`, truncate). Close on the right. Dialog uses `aria-labelledby` on the title. Escape, backdrop click, and focus return to the trigger unchanged.
- **Layout:** shrink-0 header + flex-1 scroll body (`overscroll-behavior: contain`, safe-area on all sides) + optional footer. Panel outer padding + compact inner gutters; messages in a `max-w-lg` column. Vertical header/footer `py-3`+. Same message alignment lock as above (customer right / agent left); identity via avatar only — no per-message name/**Agent** labels; no StatusDot on messages. Optional UTC clock under bubbles (`formatMessageTime`).
- **Chrome:** desktop (`md+`) inset right sheet `width: min(calc(100% - 1.5rem), 32rem)` with `0.75rem` viewport gutter, full border, `border-radius: var(--radius-panel)` on all sides; mobile bottom sheet `max-height: ~85dvh`, top corners `var(--radius-group)`, compact swipe handle. Panel padding on all sides (safe-area aware) + inner header/body/footer gutters for chat density. Panel `bg-sio-bg-base` + `sio-border-base`; backdrop `--sio-bg-overlay`; honor `prefers-reduced-motion`.
- **Empty:** same honesty as Neon stubs — “No messages stored” (no invented transcript).
- **Footer:** omitted for Insights review (feedback lives in the expanded row). No toast.

### Insights queue status

Operator-facing status chrome via `SignalStatus` → `StatusDot` (`web/src/components/ui/StatusDot.tsx`, geistcn-aligned). **Pending until review = blue**; colors follow the operator feedback label after review (not signal type). Mapping lives only in `format.ts` (`signalStatusDot`). Queue **filters** are Geist pills (Add Filter + All / Pending / Correct / Done), not `SignalStatusChip`.

| Operator state | Label | Dot |
|---|---|---|
| Pending (no feedback yet) | **Pending** | Blue (`ds-blue` / sio link) — QUEUED |
| `feedback.label === correct` | **Correct** | Green (`sio-status-success-*`) — READY |
| `feedback.label === incorrect` | **Incorrect** | Red (`sio-status-danger-*`) — ERROR |
| `feedback.label === partially_correct` | **Partially Correct** | Orange/amber (`sio-status-warning-*`) — BUILDING |
| `status === acted` | **Acted** | Muted (`sio-fg-faint`) — CANCELED |

Do not put a Shadow Mode banner under “Conversation that needs your attention.” Never render “Shadow Mode — Confirm or correct detections. Replies are drafts only; nothing is sent.” as a status, warning, or dismissible tip (`InsightsShadowTip`). That explanation stays in Help.

URL filter stays `status=new` for the Neon needs-review bucket. Queue chrome uses Geist filter pills immediately above the queue table: **Add Filter** (solid, Type menu) plus four EvidenceChip-style status chips (All / Pending / Correct / Done). Selected chips use applied chrome (solid + X). Type lives in Add Filter. Status chips stay URL `Link`s. Not beside the section title, not a combined Filters menu, and not `SegmentedTabs`. Status chips use **feedback presence/label** once reviewed (so a reviewed row never stays Pending from a stale `status===new`). Queue rows and the Pending metric breakdown always show the text label with the StatusDot (color is not the only cue). Do not use signal-type colors (lead/retention/upsell) for status. The page title stays **Insights** in `AppHeader`; the list has an `sr-only` **Insights Queue** heading (review breadcrumb uses the same label).

### Signal chrome (reuse lock)

Operator Insights surfaces (queue / in-row expand) share one chrome set — copy the locked queue look; do not re-wire icons or status mapping in views.

| Surface | Component | Notes |
|---|---|---|
| Status | `SignalStatus` only | Queue Status column and Pending metric breakdown use `StatusDot` + label; queue filters use Add Filter plus All / Pending / Correct / Done chips. Mapping stays in `format.ts` |
| Detection score | `SignalScoreChip` only | Hairline pill + band icon hex; bands unchanged via `scoreIconKind` / `scoreIconColor` |
| Type (ops scan) | `SignalTypeChip` | Same hairline pill + muted Lead / Retention / Upsell glyphs |
| Type (taxonomy / legacy colored mark) | `SignalBadge` | Colored mark for taxonomy tables only — do not duplicate chip logic inside `SignalBadge` |
| User | `SignalUser` | `Avatar` + initials (`?` when empty / `"Customer"`) + optional truncated name |

**NEVER** re-wire `scoreIconKind` / status mark mapping / type icons inline in views — import the shared components.

Shared pill class: `signalChipClass` (exported from `SignalScoreChip.tsx`).

### Insights queue Type chip

Queue **Type** column uses `SignalTypeChip`: pill radius (`rounded-full`), white/base fill, hairline only (`shadow-[0_0_0_1px_rgba(0,0,0,0.08)]` — no elevation), type glyph (`LeadIcon` / `RetentionIcon` / `UpsellIcon`, muted) + Title Case label. Expanded review reuses the same chrome in the collapsed row only.

### Insights queue Score chip

Queue **Score** column uses `SignalScoreChip` (same `signalChipClass` hairline pill as Type): band icon + tabular digits (`formatScore`) side by side. Bands on `signal.score` (0–1) via `scoreIconKind` / `scoreIconColor` (inline `color` on `GeistMaskIcon`) — only inside `SignalScoreChip`:

| Score | Display | Icon | Hex |
|---|---|---|---|
| `< 0.5` | `< 50` | `StopIcon` (`stop.svg`, solid octagon) | `#d8001b` |
| `0.5`–`0.9` | `50`–`90` | `WarningIcon` (`warning.svg`, solid triangle) | `#ff9300` |
| `> 0.9` | `> 90` | `GoodIcon` (`good.svg`, check-in-circle) | `#279141` |

Not StatusDot / feedback colors.

### Insights queue Evidence density

Desktop queue shows Evidence (quote only, truncated) from `lg+`. Between `sm` and `lg`, columns are User · Signal · Status · Score · Type · Action (no Evidence). Mobile stacked cards keep a single evidence quote line. Do not show `Next · suggestedAction` under Evidence in the collapsed row; suggested action lives in the expanded review panel.

### Insights summary display (no name echo)

When the customer name is already shown (queue User column), display summary via `queueSignalSummary(summary, customerName)` — strip a leading name + optional `(channel)`, trim leftover dashes/colons, capitalize the remainder. Fall back to the original summary if strip would empty. Do **not** change `detect.ts` / stored summaries.

## Showcase corpus names

`testing.json` encodes people in `externalId` (`rahul_mehta_29`). The loader derives `customerName` for store + detect summaries; FastAPI dual-write carries the name inside `summary` (no separate Neon customer column). UI strips the name prefix for display only (`queueSignalSummary`).


## Evaluation, reporting, and specialist screens (16 October 2026)

Evaluation labels are Metrics / Improvements / Reviewed examples / Export evaluation; IDs remain `metrics` / `adapt` / `labeled` / `export`. SignalScore uses Correct divided by all reviewed detections; Partial counts in the denominator. The selected window and existing minimum-review/go-no-go criteria remain authoritative. Pending synchronization does not count as persisted quality. All-time is context. Missing monetary totals are Unavailable, not zero. Improvement suggestions do not claim a passed evaluation.

Revenue report separates Review coverage, Estimated opportunity and Recorded outcomes. Keep currency, UTC boundaries, scope, default anonymization, PDF query, and qualifications unchanged. Current at-risk rows link to signal/evidence; historical rows stay historical and do not offer active outcome editing. Unknown, reviewer-recorded, estimated and verified values remain separate.

Taxonomy identifies shipped definitions and stored phrase overrides separately and shows meaningful empty override states. Economics uses shared panel/token chrome, measured-cost coverage and explicitly labeled projections. Neither surface claims new history or freshness contracts. Sign-in keeps password-manager inputs, original loading-button label, linked inline errors and focus on missing credentials. No unsupported recovery or identity-provider controls are added.

## Validation boundary

Implementation evidence and remaining research/dependencies live in `docs/development/tasks/UI-UX-IMPLEMENTATION.md`. This guide describes implemented behavior, not measured usability success. Representative-operator research, assistive-technology coverage, browser-specific traversal fallbacks and performance acceptance require separate recorded evidence. Persistent split layouts, saved views, dark mode, new AI features and new analytics remain deferred.

The phone target override belongs to the utility layer so per-control size utilities cannot reduce affected primary controls below 44px. Light secondary text uses the existing neutral token at OKLCH 0.53 to retain contrast on the muted workspace surface as well as white cards.
