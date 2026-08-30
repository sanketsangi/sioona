# Sioona — Project State (agent SoT)

**Last updated:** 2026-08-31  

**Stage:** MVP — Insights + Shadow Mode + Detect v2 + durable chats (**hosted verified**)  
**Branch:** `cursor/insights-review-ui-polish-f5d2` (shadcn polish: Suggested Next Action / Conversation / Feedback / Ground Truth)

Read this first in new agent windows. Update on heading / stack / blocker changes.

---

## 0. What we are doing now

**Heading: 2-week Shadow Mode pilot.** Pilot win = human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 / vLLM / Action Mode outbound. Taxonomy still JSON.

**Hosted now (2026-08-24):** Next mid-week partner upsert **skipped** — no unused dump (no `real-partner-export.week4.local.csv`; week3 already logged; week-1/week-2 `.local.csv` excluded; no invent/Adapt pack). Neon `weekly_export_count` **stayed 5** (healed from Groww overwrite null drift; baseline **12**). Eval `?scoreFrom=2026-08-24T12:18:03.000Z` keep-set **n=0 / correct=0 / incorrect=0 / Insufficient Data** (no go). Not a re-ingest of week3 / not Partner Demo wipe / not taxonomy. Prior week3 go remains the last closed real weekly.

**This week (ops, 2026-08-24):** Next real weekly partner export **blocked on dump**. Drop unused `real-partner-export.week4.local.csv` (basename already gated for week1–3 only — add week4 to ingest set when file exists) → mid-week `replaced=false` → ≥5 Corrects + Acted → keep-set ≥0.80. Local CS `batch_001` replace stays a negative example (200/0).

**This pass (code, 2026-08-31):** Suggested Next Action header uses `InsightsReviewPaneHeader` (same flex/`items-center` 43px row as Feedback / Ground Truth). Drops CardTitle `text-base` wrap and CardAction line-box; Pending chip uses `InsightsReviewStatusChip`. Title/chip midlines match. Not outbound / not Detect / not a keep-set go.

**Prior pass (code, 2026-08-31):** Feedback drops the Acted-does-not-send Note; Feedback action Buttons icon+label aligned. Mark as Acted stays on Suggested Next Action. Not outbound / not Detect / not a keep-set go.

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
| Real weekly partner export (week4 attempt) | **skipped 2026-08-24** — no unused dump (no week4 `.local.csv`; week3 already used; week-1/week-2 excluded). Count stayed **5**. Eval `?scoreFrom=2026-08-24T12:18:03.000Z` → n=0 / correct=0 / incorrect=0 / **Insufficient Data** (no go). Neon pilot healed to count **5** / baseline **12** after Groww overwrite null drift. Not Adapt / not invent pack |
| Real weekly partner export (prior skip) | **skipped 2026-08-18 evening** — no unused dump then; count stayed **4**. Superseded by week3 log above |
| Local Day-1 replace (batch_001) | **logged 2026-08-18** — customer-support `batch_001.csv` replace `replaced=true` (200 chats / 0 signals / sync failed=0; GT 200 lead; file not copied). Eval `?scoreFrom=2026-08-18T12:25:07.682Z` → n=0 / **Insufficient Data**; baseline **12**; lift **−12**. Reviews still human — not labeled go. Not Groww upsert |
| Hosted Partner Demo Zerodha (sioona-demo) | **re-verified 2026-08-21** (#51) — wipe+seed; `Zerodha_batch_02`; needs-review **14**; reviews **0**; baseline **12** preserved across wipe; Lift **+2**. Keep-set **n=0 Insufficient Data** = empty window only (Groww∩JSON mismatch closed). Next = human Insights reviews |
| Partner Demo keep-set re-query (sioona-demo) | **stopped 2026-08-21** — `?scoreFrom=2026-08-20T23:44:44.000Z`; **`zrdh_*` only** n=**0** / Insufficient Data (**no go**). Tenant overwritten by `Groww_batch_02` (100/14; Groww **14/14 Correct** ignored). Remaining `zrdh_*` pending **0** (wiped). Superseded by Partner Demo keep-set close below |
| Partner Demo keep-set (sioona-demo) | **closed 2026-08-21** — fresh wipe→`Zerodha_batch_02` (100/14; sync failed=0; not `wipeFailed`); **5** Correct on `zrdh_*` + **Acted 5/5** (display-only); `?scoreFrom=2026-08-20T23:44:44.000Z` → n=**5** / correct=5 / incorrect=0 / **1.00 → go**. Groww ignored. Remaining `zrdh_*` pending **9**. Neon: `Zerodha_batch_02` / baseline **0** / lift **14**. Supersedes prior same-day close (concurrent Groww overwrite) and local rehearsal SoT |
| Local Partner Demo keep-set rehearsal | **logged 2026-08-21** — localhost shared-Neon dry-run; `?scoreFrom=2026-08-21T10:36:10.000Z` → n=**5** / 1.00 → go. **Superseded** by hosted sioona-demo close above (same Neon) |
| Week-1 labeled Adapt CLI | P **1.00** / R **1.00** (23 labeled) — pack only; **not** a customer claim |
| Week-2 held-out Adapt CLI | P **0.89** / R **0.55** (34 labeled) — not week-1 1.00 |
| Deploy gate (2026-08-19) | web **331** / backend **56** pass; hosted 7-step smoke **all green** (Insights/Upload/Eval **200**); tenant-wide SignalScore **n=13**; keep-set Eval **n=0 → Insufficient Data** = Partner Demo JSON ids ∩ Neon Groww ids (**data**, not `/signal-score` error); **007** applied; `/pilot` **200** + `last_uploaded_file_name` |
| Deploy gate (2026-08-21 / #51) | local = origin `06057fa`; hosted 7-step smoke **green** (Insights raw **307** → follow **200** `status=new`); Partner Demo wipe ok; keep-set **n=0** = empty window (**not** Groww∩JSON); baseline **12** / Lift **+2**. Not a keep-set go |
| Deploy gate (2026-08-21 / replace guard) | origin `73081cd`; web Vitest **426** passed / **5** skipped; backend pytest **56** passed; hosted 7-step smoke **green** (health ok; Insights raw **307** → follow **200**; Upload/Eval **200**; legacy Location ok; needs-review **14**; signal-score `reviewed_count` present). Partner Demo Confirm Replace shipped. Not a keep-set go / not Partner Demo wipe |
| Deploy gate (2026-08-21 / leftover chrome) | origin `23e0b65`; web Vitest **428** passed / **5** skipped; backend pytest **56** passed; hosted 7-step smoke **green** (health ok; Insights raw **307** → follow **200** `status=new`; Upload/Eval **200**; legacy Location ok; needs-review **14**; signal-score `reviewed_count` present). Help/Guidance local dialogs + Upload tips shipped. Not a keep-set go / not Partner Demo wipe |
| Local tests (2026-08-20) | **pass** — web Vitest **416** passed / **5** skipped; backend pytest **56** passed (Partner Demo baseline preserve + Neon pilot overlay). No residual failures. Skipped file: `web/src/lib/groww-batch02.eval.test.ts` (`describe.skipIf(!PACK_PRESENT)`). Not a hosted deploy gate. |

**Cadence / infra locks:** mid-week upsert `replaced=false`; keep-set SignalScore (orphan Partner Demo rows excluded, not deleted); week-scoped `reviewed_at` + Eval `?scoreFrom=` (empty → Reviewed 0 / **Insufficient Data**, never labeled Go); Adapt + pilot settings survive `/tmp` wipe (hydrate union + Neon `007`). **Partner Demo replace guard (2026-08-21):** when `last_uploaded_file_name=Zerodha_batch_02`, Upload/ingest full-replace requires Confirm Replace (`confirm_partner_demo_replace`) — closes silent Groww overwrite of the active keep-set; Day-1 Groww/Reset replace stays one-click. **Render wake (2026-08-29):** Insights/Eval queue or score miss auto-pings `GET /api/backend-health` (FastAPI `/health`, 25s) then one `router.refresh()` (60s cooldown) so free-tier sleep does not empty the review queue; panel copy is partner-safe (no “Start FastAPI”). Groq **$20 skipped** (Free; do not Create Project limits). Never commit `*.local.csv` / PII / `store.json`.

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

- App: https://sioona-demo.vercel.app — Production `BACKEND_URL` + Detect v2 env; Partner Demo / Adapt / keep-set / week window / pilot restore verified (PRs #22–#37; Production `625b9a0` for empty-window Eval). **Real weekly week3 keep-set logged 2026-08-21:** `real-partner-export.week3.local.csv` upsert (`replaced=false`, 100/14); Eval `?scoreFrom=2026-08-21T10:43:47.000Z` → n=7 / 1.00 / **Go**; **Acted 7/7**; Neon `weekly_export_count` **5**, baseline **12**, lift **+3**. **Week4 attempt skipped 2026-08-24** — no unused dump; count stayed **5**; Eval `?scoreFrom=2026-08-24T12:18:03.000Z` → n=0 / **Insufficient Data**. **Batch-02 rehearsal (2026-08-18):** still n=7 / 1.00 at count **4** (rehearsal, not live dump). **Prior Batch-01:** `?scoreFrom=2026-08-17T19:34:00.000Z` → n=7 / 0.86. **Local Day-1 replace** of CS `batch_001` (200/0) remains localhost-only.
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
- **Real weekly partner week4 attempt skipped 2026-08-24** — no unused dump; count stayed **5**; Eval `?scoreFrom=2026-08-24T12:18:03.000Z` n=0 / Insufficient Data; Neon pilot healed (count 5 / baseline 12) after Groww overwrite null drift; not Adapt / not invent pack / not week3 re-ingest
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
- Correct → Follow-up Act beat 2026-08-30 — **this pass**: Correct from Pending → `status=followup&preview=<same id>`; Incorrect/Partial → next pending; Act cue Note + Copy Reply (clipboard only); Mark Acted Follow-up walk unchanged. Not outbound
- Deploy gate **logged 2026-08-19** — web 331 / backend 56 pass; hosted smoke all green; Eval keep-set 0 = JSON vs Neon id mismatch (not API error); Alembic **007** on Neon; no SSR/API 500s
- Deploy gate **logged 2026-08-21** (#51) — local = origin; hosted smoke green; Partner Demo wipe re-run; keep-set n=0 = empty window only (Groww∩JSON closed); baseline 12 / Lift +2 preserved across wipe
- Deploy gate **logged 2026-08-21** (`73081cd` replace guard) — web 426 / backend 56 pass; hosted 7-step smoke green (Insights 307→200; Upload/Eval 200; needs-review 14); Confirm Replace on Partner Demo keep-set live; not a keep-set go / not wipe
- Deploy gate **logged 2026-08-21** (`23e0b65` leftover chrome) — web 428 / backend 56 pass; hosted 7-step smoke green (Insights 307→200 `status=new`; Upload/Eval 200; needs-review 14); Help/Guidance dialogs + Upload tips live on sioona-demo; not a keep-set go / not wipe
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
- **Tests status (2026-08-30, this tree):** web Insights review UI polish (Suggested Next Action / Conversation / Feedback / Ground Truth) — related vitest 21 passed; `tsc --noEmit` clean; eslint clean. Residual failures: **none**. Not a hosted deploy.
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
