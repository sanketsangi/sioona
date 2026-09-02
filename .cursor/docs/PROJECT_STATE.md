# Sioona — Project State (agent SoT)

**Last updated:** 2026-09-02  

**Stage:** MVP — Insights + Shadow Mode + Detect v2 + durable chats (**hosted verified**)  
**Branch:** `main` @ `09f9687` (Insights replies + pending review walk; Vercel Production status success)

Read this first in new agent windows. Update on heading / stack / blocker changes.

---

## 0. What we are doing now

**Heading: 2-week Shadow Mode pilot.** Pilot win = human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 / vLLM / Action Mode outbound. Taxonomy still JSON.

**Hosted now (2026-08-31 evening):** Next unused weekly dump **skipped** — no Week-5 / `week5.local.csv`; Week-4 Batch-02 held-out (`week: 2026-09-01/2026-09-07`; do not ingest). No ingest. Neon `weekly_export_count` stayed **1**. Eval `?scoreFrom=2026-08-31T10:41:38.000Z` keep-set **n=0 / correct=0 / incorrect=0 / Insufficient Data** (no go); baseline **0**; lift **+20** (20−0, pack Opp., not a keep-set go); **Acted 0** (empty window). Same-day wipe+re-ingest of used Batch-01 (`10:27Z`) left count **1** / baseline **0** / all-time Reviewed **6** outside this window — not an unused-dump go. Morning week4 n=20 row stays historical. Not Batch-02 / not week3 / not Adapt / not Partner Demo wipe.

**This week (ops, 2026-08-31):** Skip logged (above). Week-4 Batch-02 is **held-out CLI only** (labeled P/R — not Eval go, not ingest). Next unused weekly dump is Week-5-or-later (not Batch-02, not week3) → mid-week `replaced=false` → ≥5 Corrects + Acted → keep-set ≥0.80. Local CS `batch_001` replace stays a negative example (200/0).

**This pass (data/gate, 2026-09-01):** Deploy gate on `09f9687` — web Vitest **598** passed / **6** skipped; backend pytest **63** passed. Local 7-step smoke green (Insights/Upload/Eval **200**; legacy `307` → `/?view=insights&preview=sig_test`; sqlite FastAPI health ok; needs-review `[]`; signal-score `reviewed_count` **0**). Eval `?scoreFrom=2026-08-31T10:41:38.000Z` keep-set **n=0 / Insufficient Data** (never labeled Go); Insights this-window **0 / ≥5**. Open PRs: **none**. Hosted curl to `sioona-demo.vercel.app` / `sioona-api.onrender.com` blocked by Cloud Agent egress (TLS handshake RST); GitHub Vercel status **success** for Production aliases. Not a keep-set go / not Partner Demo wipe / not Batch-02 ingest.

**This pass (code, 2026-09-02):** Follow-up to ingest `after()` dual-write: replace landing uses `?replaced=1` so leftover Neon overlay cards stay off until prune; deferred upsert/prune no-ops if Reset, Partner Demo, or a later ingest rewrote JSON. Not Detect / not outbound / not a keep-set go.

**This pass (code, 2026-09-02):** POST `/api/ingest` returns after detect + `writeStore`; Neon conversation/prediction dual-write (and replace prune) runs in `after()` so Upload TTFB is not blocked by N× POST `/v1/predictions`. Insights pending still paints JSON-only new signals when needs-review is empty/lagging. Upload drops the 900ms Insights delay. Not Detect / not outbound / not a keep-set go.

**This pass (code, 2026-09-02):** Insights Suggested Next Action no longer hard-errors `Signal … not found for tenant` on Mark Acted. Join/hydrate attach the live Neon prediction id (stale JSON UUIDs were kept across conversation+type match). Acted recovers like feedback: try the card UUID, upsert by conversation+type, persist the healed id. Local reply copy stays. Not Detect / not outbound / not a keep-set go.

**This pass (code, 2026-09-02):** Detect recall lift — structural intent patterns in `detect-patterns.ts` (first-product lead, close/switch/pause retention, same-login adjacent upsell) + local negation + fraud/complaint suppress on lead/upsell. Two strong keywords now clear the 0.35 bar. Groq prompt aligned (fraud ≠ upsell; informal wording still counts). **Not** Week-4 Batch-02 ingest, **not** Adapt phrase tuning, **not** planted-phrase copies. Showcase `testing.json` heuristic measurement: P **1.00** / R **0.98** (was P 1.00 / R 0.25). Held-out Batch-02 stays unread.

**This pass (code, 2026-09-01):** Insights sidebar footer restores Help / Guidance / Feedback as local sidebar dialogs above identity-only `NavUser` (Maya Chen). No Account / Billing / Theme / Log Out / Upgrade. Not a keep-set go / not outbound / not Detect.

**Prior pass (code, 2026-09-01):** Insights list SSR omits the held review pane (same duplicate `signal-summary-*` hydration as review omitting the list). PagerIconLink drops undefined `aria-keyshortcuts`. Not a keep-set go / not outbound / not Detect.

**Prior pass (code, 2026-09-01):** Insights pending review Prev / Next / Skip are outline `h-8` Buttons (QueueTablePager chrome, Phosphor Regular, visible labels). Prev/Next disable at ends (no wrap); Skip writes no feedback (last Skip → filtered list). J/K skip inputs. Not a keep-set go / not outbound / not Detect.

**Prior pass (code, 2026-09-01):** Insights `?preview=` SSR no longer hydrates the list DataTable beside review (duplicate `signal-summary-*` ids). Review chrome uses `signal-review-summary-*`. List mounts after first client paint. Not a keep-set go / not outbound / not Detect.

**Prior pass (code, 2026-09-01):** Follow-up Suggested Next Action restores **Copy Reply** (clipboard only; customer name + first Why quote; `pickAction` if copy stays empty). Copied… `aria-live`; disabled when action missing. Mark as Acted / C/I/P / A/Enter unchanged. Feedback Correct Note: Copy then Act (does not send). Neon stubs stay honest. Not outbound / not a keep-set go.

**Prior pass (code, 2026-09-01):** Open pending review has Prev / Next / Skip header Links + J/K (Skip writes no feedback; last Skip → list; filters/`scoreFrom` stay). List DataTable unchanged. Not a keep-set go / not outbound / not Detect.

**Prior pass (code, 2026-09-01):** Insights list shows quiet this-window `n / ≥5` from existing windowed `backendScore` (`InsightsQueueMetrics` footer). Empty Neon window = `0 / ≥5` (not a fake Go). SignalScoreSummary stays off Insights; review pane unchanged. Not a keep-set go / not outbound / not Detect.

**Prior pass (code, 2026-08-31):** Deploy gate — origin + sioona-demo Production match ingest weekly-pack (`9187c5b` / #79). Hosted 7-step smoke green; queue/preview still Neon SoT. Not a keep-set go / not Partner Demo wipe / not Batch-02 ingest / not Detect / not outbound.

**Prior pass (code, 2026-08-31):** Ingest weekly-pack allowlist is pattern-based (`real-partner-export.local.csv`, `real-partner-export.week{N}.local.csv`, `{company}_week_{n}_batch_{m}.json`) so week5-style names upsert when Neon `weekly_export_count` > 0. Held-out basename `Zerodha_week_4_batch_02.json` returns 409 unless Upload Confirm Ingest (`confirm_held_out_weekly_ingest`); confirmed ingest still upserts. Overlay still blocks `/tmp` Day-1 replace; unknown names still replace. Not a keep-set go / not Partner Demo wipe / not Adapt.

**Prior pass (code, 2026-08-31):** Deploy gate — origin + sioona-demo Production match Eval Metrics first-fold + Insights Feedback/GT (`b37539b` / #78). Hosted 7-step smoke green; queue/preview still Neon SoT. Not a keep-set go / not Partner Demo wipe / not Detect / not outbound.

**Prior pass (code, 2026-08-31):** Eval Metrics first fold is week-window keep-set SignalScore + Go/Hold/Insufficient Data + cadence CTA (`SignalScoreSummary` compact: `n / ≥5`). Labeled P/R lives on the Labeled panel. Hold points to Insights reviews, not Adapt. Empty Neon window stays Insufficient Data (never labeled Go). Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Feedback and Ground Truth are flattened shadcn Cards (`evalCardClassName` + `InsightsReviewPaneHeader` + `CardContent`) matching Suggested Next Action header baseline. C/I/P, notes, GT toggles, pending/saved/error unchanged. Conversation and queue table stay. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Insights DataTable list rows are the Review target (stretched `?preview=` Link); Action column Review kept. Not Detect / not outbound / not a keep-set go.

**Prior pass (code, 2026-08-31):** Deploy gate — origin + sioona-demo Production match Insights polish (`a98fd86` / #77). Hosted 7-step smoke green; queue/preview still Neon SoT. Not a keep-set go / not Partner Demo wipe.

**Prior pass (code, 2026-08-31):** Suggested Next Action header uses `InsightsReviewPaneHeader` (same flex/`items-center` 43px row as Feedback / Ground Truth). Drops CardTitle `text-base` wrap and CardAction line-box; Pending chip uses `InsightsReviewStatusChip`. Title/chip midlines match. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Feedback drops the Acted-does-not-send Note; Feedback action Buttons icon+label aligned. Mark as Acted stays on Suggested Next Action. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Suggested Next Action CardTitle sits on the same header baseline as Conversation/Feedback; Mark as Acted unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Suggested Next Action title sits on the same header baseline as Conversation/Feedback (`evalCardHeader`). Mark as Acted / Pending chip unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Insights review bubbles hug content (`w-fit`) with shadcn/Geist `gap-2` between rows and avatar. Shared `ConversationMessages` / `.chat-bubble*` keep the drawer in sync. Why jumps, evidence ring, empty Upload, timestamps off, left/right lock unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Insights review chat body matches rail Card density (`evalCardPad` `px-3 sm:px-4` / `py-3`) with geist Message/Bubble/Avatar (32px, `gap-3`). Shared `ConversationMessages` / `.chat-bubble*` keep the drawer in sync. Why jumps, evidence ring, empty Upload, timestamps off, left/right lock unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Insights review transcript drops per-message bubble clocks (`showTimestamps` off). Why jumps, avatars, data times, and ConversationDrawer clocks stay. Empty / evidence-highlight paths unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Suggested Next Action copy uses balanced `py-3`; Why/Matched share even pad/leading; WhyQuote is outline Button with `--radius-control` + `border-border`. Header / Mark as Acted unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Why This Fired + Matched inside Suggested Next Action CardContent are flush radix-vega Label / blockquote / Badge / Button (no nested quote boxes). Header / Mark as Acted / action copy unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Suggested Next Action is one flattened shadcn Card well (`CardHeader` / `CardAction` / `CardContent` + Separator; Eval density). Mark as Acted / A-Enter / ≤2 quote jumps / honesty copy unchanged. Feedback keeps `InsightsReviewPaneHeader`. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-30):** Insights queue list Card is a DataTable (`shadcn` Table + TanStack): User · Signal · Status · Score · Type · Action, sticky muted header, overflow at all sizes, URL `?page=` pager (10/page), locked chrome, `?preview=` Review Links. Empty/error Cards + review body unchanged. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-30):** Suggested Next Action header shows **Mark as Acted** for Correct-not-Acted (A / Enter walk; no Correct chip in that slot). Feedback / Ground Truth wells keep full borders. Queue Card/Separator list and Conversation chat well stay. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-30):** Insights queue is a Card/Separator ops list (`SignalQueue` / `SignalQueueRow`: aligned User·Signal·Status·Score·Type columns, denser mobile chips, same empty/unavailable Card as metrics). Review still opens via `?preview=`. Not Detect / not Auth0 / not outbound / not a keep-set go.

**Prior pass (code, 2026-08-30):** Insights review Conversation is the primary chat-app well (`SignalReviewConversation`: sticky `SignalUser` header, full-height scroll transcript, native Why This Fired highlight). In-pane **See Conversation** dropped; header **Open Conversation** drawer stays as overflow. Empty → Upload Chats. Not Detect / not Auth0 / not outbound / not a keep-set go.

**Shipped on origin (2026-08-20):** Partner Demo wipe→`zerodha_batch_02.json` only + Insights Follow-up/Done from Neon + unlocked Action Mode (prod locked) + pending landing / Mark Acted Pending return. Hosted Partner Demo already exercised. Partner Demo **preserves partner baseline** after wipe (no more share-out 12→4 footgun); cold-demo 4 still applies when no partner baseline exists.

| Gate | Result |
| --- | --- |
| Week-1 keep-set (sioona-demo) | n=6 / correct=5 / incorrect=1 / **0.83 → go**; baseline **12**; lift **23** |
| Week-2 keep-set (sioona-demo) | n=7 / correct=7 / incorrect=0 / **1.00 → go**; baseline **12**; lift **6** (18−12). Not week-1 0.83 |
| This week keep-set (sioona-demo) | **logged 2026-08-17** — n=6 / correct=6 / incorrect=0 / **1.00 → go**; baseline **12**; lift **−2** (10−12). Pack: partner-shaped 16 chats / 10 signals; mid-week `replaced=false`; `?scoreFrom=2026-08-17`. **Acted 7/7** window Corrects (display-only) |
| Next-week keep-set (sioona-demo) | **logged 2026-08-18** — n=7 / correct=6 / incorrect=1 / **0.86 → go**; baseline **12**; lift **18** (30−12). Pack: Groww Batch-01 upsert `replaced=false` (100/7; sync failed=0); `weekly_export_count` **3**; `?scoreFrom=2026-08-17T19:34:00.000Z`. **Acted 6/6** window Corrects (display-only). Not the closed 2026-08-17 n=6 / 1.00 |
| Batch-02 rehearsal keep-set (sioona-demo) | **logged 2026-08-18** — n=7 / correct=7 / incorrect=0 / **1.00 → go**; baseline **12**; lift **+23** (35−12). Pack: Groww Batch-02 JSON upsert `replaced=false` (100/14; sync failed=0); `weekly_export_count` **4**; `?scoreFrom=2026-08-18T14:37:31.774Z`. **Acted 7/7** window Corrects (display-only). Rehearsal, not a live partner dump. Not the closed Batch-01 n=7 / 0.86 |
| Real weekly partner export (week3) | **logged 2026-08-21** — unused Groww Batch-02 `real-partner-export.week3.local.csv` upsert `replaced=false` (100/14; sync failed=0; file not copied) → `weekly_export_count` **5**; `?scoreFrom=2026-08-21T10:43:47.000Z` → n=7 / correct=7 / incorrect=0 / **1.00 → go**; baseline **12**; lift **+3** (15−12). **Acted 7/7** window Corrects (display-only). Not Partner Demo wipe / not Adapt / not week-1/week-2 `.local.csv` / not Batch-02 JSON rehearsal. Supersedes 2026-08-18 evening skip |
| Real weekly partner export (week4) | **logged 2026-08-31** — unused Zerodha Week-4 Batch-01 pack (same as `real-partner-export.week4.local.csv`) upsert `replaced=false` as `Zerodha_week_4_batch_01.json` (100 chats; file not copied; Batch-02 held-out). Count **5→6**; CSV POST skipped so count stayed **6**. Eval `?scoreFrom=2026-08-31T09:58:00.000Z` → n=20 / correct=20 / incorrect=0 / **1.00 → go**; baseline **12**; lift **+36** (48−12). **Acted 20/20** window Corrects (display-only). Ingest gate `fbb4d10`. Not Partner Demo wipe / not Adapt / not week3 re-ingest / not week-1/week-2 `.local.csv`. Supersedes 2026-08-24 skip and the same-day n=7 / 09:51:38 reading. Historical: live Neon later wiped+re-ingested the same pack (`10:27Z`; count **1** / baseline **0**) |
| Real weekly partner export (next unused) | **skipped 2026-08-31 evening** — no unused dump (Week-4 Batch-02 held-out; no Week-5). Count stayed **1**. Eval `?scoreFrom=2026-08-31T10:41:38.000Z` → n=0 / correct=0 / incorrect=0 / **Insufficient Data**; baseline **0**; lift **+20** (20−0); **Acted 0**. Not Batch-02 ingest / not week3 / not Adapt / not Partner Demo wipe / not a keep-set go |
| Real weekly partner export (week4 attempt) | **skipped 2026-08-24** — no unused dump then. Count stayed **5**. Eval `?scoreFrom=2026-08-24T12:18:03.000Z` → n=0 / **Insufficient Data**. **Superseded** by week4 log above |
| Real weekly partner export (prior skip) | **skipped 2026-08-18 evening** — no unused dump then; count stayed **4**. Superseded by week3 log above |
| Local Day-1 replace (batch_001) | **logged 2026-08-18** — customer-support `batch_001.csv` replace `replaced=true` (200 chats / 0 signals / sync failed=0; GT 200 lead; file not copied). Eval `?scoreFrom=2026-08-18T12:25:07.682Z` → n=0 / **Insufficient Data**; baseline **12**; lift **−12**. Reviews still human — not labeled go. Not Groww upsert |
| Hosted Partner Demo Zerodha (sioona-demo) | **re-verified 2026-08-21** (#51) — wipe+seed; `Zerodha_batch_02`; needs-review **14**; reviews **0**; baseline **12** preserved across wipe; Lift **+2**. Keep-set **n=0 Insufficient Data** = empty window only (Groww∩JSON mismatch closed). Next = human Insights reviews |
| Partner Demo keep-set re-query (sioona-demo) | **stopped 2026-08-21** — `?scoreFrom=2026-08-20T23:44:44.000Z`; **`zrdh_*` only** n=**0** / Insufficient Data (**no go**). Tenant overwritten by `Groww_batch_02` (100/14; Groww **14/14 Correct** ignored). Remaining `zrdh_*` pending **0** (wiped). Superseded by Partner Demo keep-set close below |
| Partner Demo keep-set (sioona-demo) | **closed 2026-08-21** — fresh wipe→`Zerodha_batch_02` (100/14; sync failed=0; not `wipeFailed`); **5** Correct on `zrdh_*` + **Acted 5/5** (display-only); `?scoreFrom=2026-08-20T23:44:44.000Z` → n=**5** / correct=5 / incorrect=0 / **1.00 → go**. Groww ignored. Remaining `zrdh_*` pending **9**. Neon: `Zerodha_batch_02` / baseline **0** / lift **14**. Supersedes prior same-day close (concurrent Groww overwrite) and local rehearsal SoT |
| Local Partner Demo keep-set rehearsal | **logged 2026-08-21** — localhost shared-Neon dry-run; `?scoreFrom=2026-08-21T10:36:10.000Z` → n=**5** / 1.00 → go. **Superseded** by hosted sioona-demo close above (same Neon) |
| Week-1 labeled Adapt CLI | P **1.00** / R **1.00** (23 labeled) — pack only; **not** a customer claim |
| Week-2 held-out Adapt CLI | P **0.89** / R **0.55** (34 labeled) — not week-1 1.00 |
| Week-4 Batch-02 held-out CLI | **logged 2026-08-31** — n=100; base P **1.00** / R **0.27**; adapt P **0.96** / R **0.44** — **held-out CLI, not keep-set**; not Eval go; not a customer claim; file not copied; no ingest. Neon `weekly_export_count` **still 1** (not bumped; morning keep-set log was **6** before wipe+re-ingest) |
| Deploy gate (2026-08-19) | web **331** / backend **56** pass; hosted 7-step smoke **all green** (Insights/Upload/Eval **200**); tenant-wide SignalScore **n=13**; keep-set Eval **n=0 → Insufficient Data** = Partner Demo JSON ids ∩ Neon Groww ids (**data**, not `/signal-score` error); **007** applied; `/pilot` **200** + `last_uploaded_file_name` |
| Deploy gate (2026-08-21 / #51) | local = origin `06057fa`; hosted 7-step smoke **green** (Insights raw **307** → follow **200** `status=new`); Partner Demo wipe ok; keep-set **n=0** = empty window (**not** Groww∩JSON); baseline **12** / Lift **+2**. Not a keep-set go |
| Deploy gate (2026-08-21 / replace guard) | origin `73081cd`; web Vitest **426** passed / **5** skipped; backend pytest **56** passed; hosted 7-step smoke **green** (health ok; Insights raw **307** → follow **200**; Upload/Eval **200**; legacy Location ok; needs-review **14**; signal-score `reviewed_count` present). Partner Demo Confirm Replace shipped. Not a keep-set go / not Partner Demo wipe |
| Deploy gate (2026-08-21 / leftover chrome) | origin `23e0b65`; web Vitest **428** passed / **5** skipped; backend pytest **56** passed; hosted 7-step smoke **green** (health ok; Insights raw **307** → follow **200** `status=new`; Upload/Eval **200**; legacy Location ok; needs-review **14**; signal-score `reviewed_count` present). Help/Guidance local dialogs + Upload tips shipped. Not a keep-set go / not Partner Demo wipe |
| Deploy gate (2026-08-31 / Insights polish #77) | origin `a98fd86`; web Vitest **537** passed / **5** skipped; backend pytest **63** passed; hosted 7-step smoke **green** (health ok; Insights/Upload/Eval **200**; Insights `?preview=` **200**; legacy Location `/insights/sig_test` → `/?view=insights&preview=sig_test`; needs-review JSON **20**; signal-score `reviewed_count` **8**). Production already on `a98fd86`. Queue/preview Neon SoT. Not a keep-set go / not Partner Demo wipe |
| Deploy gate (2026-08-31 / Eval first-fold #78) | origin `b37539b`; web Vitest **548** passed / **5** skipped; backend pytest **63** passed; hosted 7-step smoke **green** (health ok; Insights/Upload/Eval **200**; Insights `?preview=` **200**; legacy Location `/insights/sig_test` → `/?view=insights&preview=sig_test`; needs-review JSON **14**; signal-score `reviewed_count` **6**). Production on `b37539b`. Eval `n / ≥5` + verdict + cadence live; empty `?scoreFrom=2026-08-31T10:41:38.000Z` stays **Insufficient Data** (never labeled Go). Queue/preview Neon SoT. Not a keep-set go / not Partner Demo wipe |
| Deploy gate (2026-08-31 / ingest weekly-pack #79) | origin `9187c5b`; web Vitest **560** passed / **5** skipped; backend pytest **63** passed; hosted 7-step smoke **green** (health ok; Insights/Upload/Eval **200**; Insights `?preview=` **200**; legacy Location `/insights/sig_test` → `/?view=insights&preview=sig_test`; needs-review JSON **20**; signal-score `reviewed_count` **10**). Production on `9187c5b`. Week5-style names upsert when Neon count > 0; Batch-02 409 without Confirm Ingest. Queue/preview Neon SoT. Not a keep-set go / not Partner Demo wipe / not Batch-02 ingest |
| Deploy gate (2026-09-01 / `09f9687`) | origin `09f9687`; web Vitest **598** passed / **6** skipped; backend pytest **63** passed; local 7-step smoke **green** (Insights/Upload/Eval **200**; Insights `?preview=` **200**; legacy Location `/insights/sig_test` → `/?view=insights&preview=sig_test`; sqlite health ok; needs-review **0**; signal-score `reviewed_count` **0**). Eval empty window **Insufficient Data**; Insights **0 / ≥5**. Open PRs **none**. Hosted 7-step curl **not run** — Cloud Agent egress omits `*.vercel.app` / `*.onrender.com` (curl 35 SSL_ERROR_SYSCALL); Vercel GitHub status **success** on `sioona-demo.vercel.app`. Not a keep-set go / not Partner Demo wipe / not Batch-02 ingest |
| Local tests (2026-08-20) | **pass** — web Vitest **416** passed / **5** skipped; backend pytest **56** passed (Partner Demo baseline preserve + Neon pilot overlay). No residual failures. Skipped file: `web/src/lib/groww-batch02.eval.test.ts` (`describe.skipIf(!PACK_PRESENT)`). Not a hosted deploy gate. |

**Cadence / infra locks:** mid-week upsert `replaced=false`; keep-set SignalScore (orphan Partner Demo rows excluded, not deleted); week-scoped `reviewed_at` + Eval `?scoreFrom=` (empty → Reviewed 0 / **Insufficient Data**, never labeled Go); Adapt + pilot settings survive `/tmp` wipe (hydrate union + Neon `007`). **Weekly ingest gate (2026-08-31):** upsert basenames `real-partner-export.local.csv` / `real-partner-export.week{N}.local.csv` / `{company}_week_{n}_batch_{m}.json` when Neon `weekly_export_count` > 0; unknown names replace. **Held-out:** `Zerodha_week_4_batch_02.json` requires Confirm Ingest (`confirm_held_out_weekly_ingest`) — 409 without it. **Partner Demo replace guard (2026-08-21):** when `last_uploaded_file_name=Zerodha_batch_02`, Upload/ingest full-replace requires Confirm Replace (`confirm_partner_demo_replace`) — closes silent Groww overwrite of the active keep-set; Day-1 Groww/Reset replace stays one-click. **Render wake (2026-08-29):** Insights/Eval queue or score miss auto-pings `GET /api/backend-health` (FastAPI `/health`, 25s) then one `router.refresh()` (60s cooldown) so free-tier sleep does not empty the review queue; panel copy is partner-safe (no “Start FastAPI”). Groq **$20 skipped** (Free; do not Create Project limits). Never commit `*.local.csv` / PII / `store.json`.

**Do not:** Auth0, pgvector, vLLM/QLoRA/LangGraph, live webhooks, autonomous actions, further design-language work after the leftover chrome pass, FastAPI classify, Groq project rate limits, 429 retries, taxonomy/signals on Neon, taxonomy expansion to fake recall, more Adapt phrase tuning.

---

## 1. Product (one line)

**Sioona.ai** — overlay conversation intelligence (`lead` / `retention` / `upsell`) on existing chats. Shadow Mode review. **Not** a chatbot. Engine name **SignalC1** — never in UI. Primary Detect signal: **retention**.

---

## 2. Locked architecture

| Layer | Current | Later (do not start) |
| --- | --- | --- |
| App | Next.js 15/16 App Router, React 19, Tailwind, Geist (`web/`) | — |
| API | FastAPI Signal Score only (`backend/`) | Auth0-gated multi-tenant API |
| Detect | `detect.ts` heuristics + optional `detect-llm.ts` Groq pass 2 | vLLM / LangGraph / QLoRA |
| Data | JSON `store.ts` for chats/taxonomy (**UI SoT** when file exists); **Neon** for predictions + feedback + Acted (`004`) + conversations/messages + `ground_truth` (`005`) + pilot settings (`006`/`007`) + cold-start hydrate | Full Neon chat SoT + taxonomy + pgvector |
| Auth | `X-Tenant-Id` (`tenant_demo`) | Auth0 |
| Hosting | Vercel `sioona-demo.vercel.app` + Render `sioona-api.onrender.com` (free, sleeps) + Neon `sioona` | Render Starter / Neon Launch if sleep hurts |
| Score SoT | FastAPI + Neon | — |
| Queue SoT | Pending: `GET …/signals/needs-review`. Follow-up / Done: `GET …/signals` (`correct` ¬acted / `acted`) | — |

**Unused:** Render `sioona` / `sioona.onrender.com` — **deleted** (404). Keep **`sioona-api`** `/health` ok.

**Autonomy:** Shadow Mode default. Unlocked Action Mode = Insights Follow-up Act queue (Suggested Next Action + Mark Acted; display-only). `status: acted` never executes outbound. Prod locks Action Mode.

---

## 3. Detect v2 — **closed / hosted verified** 2026-08-14

Heuristics always → optional Groq Qwen on zero-signal misses (`DETECT_LLM=1` + `GROQ_API_KEY`; concurrency **2**; fail-soft; LLM must not override heuristic hits) → prediction upsert. File: `web/src/lib/detect-llm.ts`. Off by default → $0. See `web/.env.example`, `web/DEPLOY.md`.

Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Do **not** move classify to FastAPI / add 429 retries / Create Groq project limits.

---

## 4. Repo map

**Architecture (Ask SoT):** [`.cursor/docs/architecture.md`](./architecture.md) — topology, dual SoT, Detect, backend surface, seams.  
Types / taxonomy / detect / ingest / store / eval / sync / hydrate: `web/src/lib/`. Backend: `backend/app/`. Signal chrome locked: `SignalStatus` / `SignalScoreChip` / `SignalTypeChip` / `SignalUser`. Rules: `sioona-architecture.mdc`, `sioona-domain.mdc`, `sioona-product.mdc`, `architect.mdc`. Alias `@/*` → `web/src/*`.

---

## 5. Hosted pointers

- App: https://sioona-demo.vercel.app — Production `BACKEND_URL` + Detect v2 env; Partner Demo / Adapt / keep-set / week window / pilot restore verified (PRs #22–#37; Production `625b9a0` for empty-window Eval). **Next unused weekly dump skipped 2026-08-31 evening:** no Week-5; Batch-02 held-out; Eval `?scoreFrom=2026-08-31T10:41:38.000Z` → n=0 / **Insufficient Data**; count stayed **1**; baseline **0**; lift **+20**. **Real weekly week4 keep-set logged 2026-08-31 (historical):** Batch-01 pack (`Zerodha_week_4_batch_01.json`, same chats as `real-partner-export.week4.local.csv`) upsert (`replaced=false`, 100 chats; file not copied); Eval `?scoreFrom=2026-08-31T09:58:00.000Z` → n=20 / 1.00 / **Go**; **Acted 20/20**; then live Neon wipe+re-ingest `10:27Z` (count **6→1**, baseline **12→0**). Production ingest `9187c5b` / #79 pattern-gates weekly packs (week5-style upsert; Batch-02 409 without confirm). Prior `fbb4d10` gated week4 CSV basename. **Week3 (2026-08-21):** `real-partner-export.week3.local.csv` upsert (`replaced=false`, 100/14); `?scoreFrom=2026-08-21T10:43:47.000Z` → n=7 / 1.00 / **Go**; count was **5**. **Batch-02 rehearsal (2026-08-18):** still n=7 / 1.00 at count **4** (rehearsal, not live dump). **Prior Batch-01:** `?scoreFrom=2026-08-17T19:34:00.000Z` → n=7 / 0.86. **Local Day-1 replace** of CS `batch_001` (200/0) remains localhost-only.
- API: https://sioona-api.onrender.com/health → ok (free; cold ~15m). Auto-deploy `main`; `alembic upgrade head`
- Neon head: `007_pilot_upload_name` (`002`–`007` applied; `last_uploaded_file_name` on `pilot_settings`). Vercel `/tmp` ephemeral — hydrate restores chats + Adapt union + pilot + feedback/Acted/GT
- Vercel token: `web/.env` `VERCEL_TOKEN` (gitignored)

---

## 6. Closed / log (condensed)

- Insights Shadow Mode queue + review → Neon then JSON mirror
- Ingest: Day-1 replace + mid-week `externalId` upsert; PII regex; multi-format
- Detect v2 hybrid + upsert `002` + concurrency 2 — **hosted closed** (PR #21)
- Durable chats `003` + hydrate + Acted `004` + GT `005` + pilot `006` — **hosted verified** (PRs #22–#31)
- Real-partner Adapt + live SignalScore **0.83 go** keep-set — **hosted** (PR #27); Adapt hydrate union (PR #29)
- Week-scoped SignalScore + empty-window Insufficient Data — **hosted** (PR #34 + #37)
- Week-1 / Week-2 dry-runs logged (go above); week-2 held-out CLI scored; Zerodha Adapt shipped 2026-08-15 (stop phrase tuning)
- **This week keep-set logged 2026-08-17** — mid-week `replaced=false`; n=6 / 1.00 → go; baseline 12; lift −2 (partner-shaped pack); **Mark Acted** on window Corrects (7/7); next-week upsert skipped (no file)
- **Next-week keep-set logged 2026-08-18** — Groww Batch-01 upsert `replaced=false` (100/7; sync failed=0); n=7 / 0.86 → go; baseline 12; lift 18; **Mark Acted** on window Corrects (6/6); not `*.local.csv` / not the closed 2026-08-17 window
- **Batch-02 rehearsal keep-set logged 2026-08-18** — Groww Batch-02 JSON upsert `replaced=false` (100/14; sync failed=0); n=7 / 1.00 → go; baseline 12; lift +23; **Mark Acted** on window Corrects (7/7); `weekly_export_count` **4**; `?scoreFrom=2026-08-18T14:37:31.774Z`; not a live partner dump / not CS `batch_001` / not the closed Batch-01 window
- **Real weekly partner upsert skipped 2026-08-18 evening** — no unused dump then; count stayed **4** — **superseded** by week3 log below
- **Real weekly partner week3 keep-set logged 2026-08-21** — `real-partner-export.week3.local.csv` upsert `replaced=false` (100/14; sync failed=0; file not copied; basename gated in ingest); `weekly_export_count` **5**; `?scoreFrom=2026-08-21T10:43:47.000Z` → n=7 / 1.00 → go; baseline 12; lift +3; **Acted 7/7**; not Partner Demo wipe / not Adapt / not week-1/week-2 `.local.csv`
- **Real weekly partner week4 keep-set logged 2026-08-31** — Week-4 Batch-01 pack (same as `real-partner-export.week4.local.csv`) upsert `replaced=false` as `Zerodha_week_4_batch_01.json` (100 chats; file not copied; Batch-02 held-out); `weekly_export_count` **6**; CSV POST skipped (count already 6); Eval `?scoreFrom=2026-08-31T09:58:00.000Z` → n=20 / 1.00 → go; baseline 12; lift +36 (48−12); **Acted 20/20**; ingest gate `fbb4d10` overlays Neon export count before replace; not Partner Demo wipe / not Adapt / not week3 re-ingest / not week-1/week-2 `.local.csv`. Live Neon later wiped+re-ingested the same pack (`10:27Z`; count **1** / baseline **0**)
- **Real weekly partner next unused skipped 2026-08-31 evening** — no unused dump (Batch-02 held-out; no Week-5); count stayed **1**; Eval `?scoreFrom=2026-08-31T10:41:38.000Z` n=0 / Insufficient Data; baseline 0; lift +20; Acted 0; not Batch-02 ingest / not a keep-set go
- **Real weekly partner week4 attempt skipped 2026-08-24** — no unused dump then; count stayed **5**; Eval `?scoreFrom=2026-08-24T12:18:03.000Z` n=0 / Insufficient Data — **superseded** by week4 log above
- **Local Day-1 replace logged 2026-08-18** — customer-support `batch_001.csv` `replaced=true` (200/0; sync failed=0; GT 200 lead; file not copied); Eval `?scoreFrom=2026-08-18T12:25:07.682Z` n=0 / Insufficient Data; baseline 12; lift −12; no human reviews; not Adapt / not Groww upsert
- Insights chrome 2026-08-15 (dashboard header, Performance metrics, Mark Acted, Eval export panel)
- Partner leftover chrome 2026-08-19 — Help/Guidance disabled; `NavUser` identity-only (no Account / Billing / Notifications / Log Out); Demo workspace; Export/Create Campaign hidden at all breakpoints; Insights first fold = ops queue + Performance metric-strip; bell exceptions-only (no queue-clear); Partner Demo on Upload; shadcn bound to `sio-*` (not keep-set)
- Leftover chrome Help/Guidance **shipped 2026-08-21** (`23e0b65`) — local sidebar dialogs (Shadow Mode FAQ / pilot cadence) + Upload tips + score-window calendar; `NavUser` still identity-only. Not Auth0 / not a keep-set go / not wipe
- Hosted FastAPI-down bell 2026-08-20 — one partner-safe sticky `queue-unavailable` (no FastAPI/BACKEND_URL copy; no second `score-unavailable` for the same outage); not a Signal Score SoT change
- Partner Demo / sample pack split 2026-08-20 — **shipped + hosted verified**: cold open + Reset stay Groww `testing.json`; **Run Partner Demo** wipes Neon then loads only committed `zerodha_batch_02.json` (no Adapt, no Groww merge); fixtures unlisted from Upload pack. Hosted breadcrumb Zerodha; keep-set empty because **0 reviews** after wipe (not Groww∩demo mismatch).
- Partner Demo preserves partner baseline 2026-08-20 — snapshot Neon baseline before wipe; restore after Zerodha seed when not cold-demo 4 (share-out 12→4 footgun closed). `weekly_export_count` still resets. Cold first run stays baseline 4.
- Neon pilot overlay on SSR 2026-08-20 — platform page refreshes `store.pilot` from Neon (heal ephemeral `/tmp` JSON) so Eval lift/breadcrumb match share-out baseline after Partner Demo / cross-instance set_baseline.
- Feedback stale-UUID recovery 2026-08-16 — resolve by Neon id / conversation+type; upsert+retry on 404 (hosted Correct without “not found for tenant”)
- Acted stale-id recovery 2026-08-19 — Mark as Acted reuses feedback resolve (Neon UUID / conversation+type / `sig_neon_` stub); JSON fail-soft; neon-only `setPredictionActed` when the row is missing or unreviewed (hosted Correct → Acted without “Signal not found”)
- Insights follow-up lists 2026-08-20 — **shipped**: Needs Follow-Up (`correct` ¬acted) and Done (`acted`) from Neon `GET …/signals`; request-scoped chat overlay when JSON misses the conversation; Mark Acted still display-only. Not a keep-set win / not Auth0
- Unlocked Action Mode 2026-08-20 — **shipped**: `?mode=action` deep-links Insights Follow-up Act queue (Suggested Next Action + Mark Acted; FastAPI+Neon Acted SoT; nothing sent). Prod stays locked (ModeToggle bounce + strip `mode=action`). Unlock via local `next dev` or `NEXT_PUBLIC_ACTION_MODE_UNLOCKED`. Export/Create Campaign stay hidden. Not outbound / not Auth0
- Insights pending overlay 2026-08-29 — **shipped** (#55/#56): pending stubs + `filterPendingWithChat`; overlay includes pending ids
- Eval keep-set ∪ overlay 2026-08-29 — **shipped** (#57): SignalScore keep-set unions overlay conversation ids so stub reviews count; overlay still not written to JSON
- Insights pending landing 2026-08-20 — **shipped**: omitted status with Follow-up empty + Pending > 0 lands Pending (`status=new` via `resolveInsightsStatusFilter`); **first SSR 200** (no post-FastAPI `redirect` / 307). Address bar may canonicalize with client `history.replaceState` only. Explicit empty Follow-up stays compact + Review Pending. Not a keep-set win / not outbound
- Insights queue + in-queue review responsive 2026-08-30 — **this pass**: container-query split (Why → transcript → Feedback; wide = transcript | rail), drawer-matched `max-w-md` chat column, Why This Fired jump, honest empty transcript; no new palette
- Last Correct → Follow-up Acted rail 2026-08-30 — **this pass**: last Pending Correct opens Follow-up `?preview=`; Suggested Next Action rail-only Mark as Acted primary (A / Enter walk); header Mark as Pending undo after Acted; not outbound
- Mark Acted Pending return 2026-08-20 — **shipped**: Mark Acted from Pending / All returns to next pending `?preview=` or `status=new` list (not empty Follow-up); Follow-up Act-queue Correct walk unchanged. Not outbound
- Copy Reply restore 2026-09-01 — **this pass**: Suggested Next Action Copy Reply (clipboard only) from customer + first Why quote; `pickAction` fallback; Mark Acted unchanged. Not outbound
- Correct → Follow-up Act beat 2026-08-30 — Correct from Pending → `status=followup&preview=<same id>`; Incorrect/Partial → next pending; Mark Acted Follow-up walk unchanged. Not outbound
- Deploy gate **logged 2026-08-19** — web 331 / backend 56 pass; hosted smoke all green; Eval keep-set 0 = JSON vs Neon id mismatch (not API error); Alembic **007** on Neon; no SSR/API 500s
- Deploy gate **logged 2026-08-21** (#51) — local = origin; hosted smoke green; Partner Demo wipe re-run; keep-set n=0 = empty window only (Groww∩JSON closed); baseline 12 / Lift +2 preserved across wipe
- Deploy gate **logged 2026-08-21** (`73081cd` replace guard) — web 426 / backend 56 pass; hosted 7-step smoke green (Insights 307→200; Upload/Eval 200; needs-review 14); Confirm Replace on Partner Demo keep-set live; not a keep-set go / not wipe
- Deploy gate **logged 2026-08-21** (`23e0b65` leftover chrome) — web 428 / backend 56 pass; hosted 7-step smoke green (Insights 307→200 `status=new`; Upload/Eval 200; needs-review 14); Help/Guidance dialogs + Upload tips live on sioona-demo; not a keep-set go / not wipe
- Deploy gate **logged 2026-08-31** (`a98fd86` / #77 Insights polish) — web 537 / backend 63 pass; sioona-demo Production already on SHA; hosted 7-step smoke green (Insights/Upload/Eval 200; preview 200; needs-review 20; signal-score `reviewed_count` 8); queue/preview Neon SoT; not a keep-set go / not Partner Demo wipe
- Deploy gate **logged 2026-08-31** (`b37539b` / #78 Eval first-fold + Feedback/GT) — web 548 / backend 63 pass; sioona-demo Production on SHA; hosted 7-step smoke green (Insights/Upload/Eval 200; preview 200; needs-review 14; signal-score `reviewed_count` 6); empty-window `?scoreFrom=` Insufficient Data (never labeled Go); queue/preview Neon SoT; not a keep-set go / not Partner Demo wipe
- Deploy gate **logged 2026-08-31** (`9187c5b` / #79 ingest weekly-pack) — web 560 / backend 63 pass; sioona-demo Production on SHA; hosted 7-step smoke green (Insights/Upload/Eval 200; preview 200; needs-review 20; signal-score `reviewed_count` 10); week5-style upsert + Batch-02 409 without confirm; queue/preview Neon SoT; not a keep-set go / not Partner Demo wipe / not Batch-02 ingest
- Deploy gate **logged 2026-09-01** (`09f9687`) — web 598 / backend 63 pass; local Insights/Upload/Eval 200 + empty-window Insufficient Data; open PRs none; hosted curl blocked by Cloud Agent egress; Vercel GitHub status success for Production aliases; not a keep-set go / not Partner Demo wipe / not Batch-02 ingest
- Partner Demo keep-set re-query **stopped 2026-08-21** — `scoreFrom=2026-08-20T23:44:44.000Z`; `zrdh_*` n=0 / no go; Groww_batch_02 overwrite (14 Correct ignored); remaining `zrdh_*` pending 0
- Partner Demo keep-set **closed 2026-08-21 (sioona-demo, fresh)** — wipe→Zerodha_batch_02 (100/14; sync failed=0); 5 Correct + Acted 5/5 on `zrdh_*`; `?scoreFrom=2026-08-20T23:44:44.000Z` → n=5 / 1.00 → go; baseline 0 / lift 14; pending 9; Groww ignored; no Adapt / no outbound
- Prior same-day Partner Demo keep-set (pending 3; concurrent Groww overwrite) and local rehearsal (`scoreFrom=2026-08-21T10:36:10.000Z`) — **superseded** by hosted close above
- Partner Demo Groww overwrite guard **shipped 2026-08-21** — ingest 409 + UploadForm Confirm Replace when last upload is `Zerodha_batch_02`; Day-1 Groww/Reset replace unchanged
- Groq $20 spend cap **skipped**; unused Render `sioona` **deleted**
- Insights pending overlay **shipped 2026-08-29** — Neon needs-review stubs kept when store/overlay has the chat; stale pack ids without chat still omitted; overlay fetch includes pending ids. Skill `.cursor/skills/insights-queue-join/SKILL.md`. Not a keep-set go / not wipe
- Insights overlay by conversation id **shipped 2026-08-29** (#59) — `GET …/conversations?conversation_id=` keep-set (not full tenant list). Insights + Eval still fetch overlay so #57 keep-set SignalScore includes stub chats. Not a keep-set go / not wipe
- Render free-tier wake **this pass (2026-08-29)** — `QueueWakeRetry` on `queue-unavailable` / `score-unavailable`; BFF `/api/backend-health`; Insights error panels drop “Start FastAPI”. Not a keep-set go / not Auth0 / not Detect

---

## 7. Later / do not start

- Auth0 / real tenant isolation
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode outbound send (unlocked Action Mode = Insights Act queue only; prod locked)
- Export / Create Campaign (unshipped — hidden, not overflow)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / classify-on-FastAPI / 429 retries / Groq project limits / taxonomy-on-Neon

---

## 8. How to work

- Ask = Architect (prompts). Agent = build. Small verifiable steps.
- Ask stack map: `.cursor/docs/architecture.md`. This file = heading / gates / do-not-start.
- Tests: `cd web && npm test`; `cd backend && .venv/bin/python -m pytest`.
- **Tests status (2026-09-01, this tree):** web Vitest **598** passed / **6** skipped; backend pytest **63** passed. Residual failures: **none**. Origin `09f9687`; Vercel Production status success. Local 7-step smoke green; hosted curl blocked by Cloud Agent egress (`*.vercel.app` / `*.onrender.com` not allowlisted). Empty-window Eval **Insufficient Data**. Open PRs none. Not a keep-set go. Week4 keep-set historical (n=20 / Go); next unused dump **skipped** (n=0 / Insufficient Data; count **1**). Batch-02 remains held-out (CLI only; ingest 409 without confirm).
- Update **this file** when heading, gates, or blockers change; update `architecture.md` when topology / SoT / seams change.
- Signal chrome locked — reuse chips; do not invent status/score/type UI.

### Deploy gate (every deploy)

Full copy-paste block: [`web/DEPLOY.md`](../../web/DEPLOY.md#deploy-gate-every-deploy). Render free-tier may cold-start (~15m idle); if `/health` fails, retry once after ~30s.

**Before each deploy**

```bash
cd web && npm test
cd backend && .venv/bin/python -m pytest
```

Both must pass before pushing/deploying.

**After each deploy** — 7-step curl smoke (`BACKEND_URL` / `VERCEL_URL` / `TENANT`):

```bash
export BACKEND_URL="https://sioona-api.onrender.com"   # Render FastAPI
export VERCEL_URL="https://sioona-demo.vercel.app"     # Vercel web
export TENANT="tenant_demo"

# 1. Backend boot
curl -sS "$BACKEND_URL/health"
# expect: {"status":"ok"}

# 2. Critical UI routes (SSR must not 500)
curl -sS -o /dev/null -w "insights=%{http_code}\n" "$VERCEL_URL/?view=insights"
curl -sS -o /dev/null -w "upload=%{http_code}\n" "$VERCEL_URL/?view=upload"
curl -sS -o /dev/null -w "eval=%{http_code}\n" "$VERCEL_URL/?view=eval"

# 3. Legacy signal deep-link redirect
curl -sS -D- -o /dev/null "$VERCEL_URL/insights/sig_test" | rg -i "^location:"
# expect: Location: /?view=insights&preview=sig_test

# 4. Shadow Mode queue API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signals/needs-review" \
  -H "X-Tenant-Id: $TENANT"
# expect: JSON array (may be empty)

# 5. Signal Score API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signal-score" \
  -H "X-Tenant-Id: $TENANT"
# expect: reviewed_count, signal_score fields
```
