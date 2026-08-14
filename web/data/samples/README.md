# Partner sample pack

Showcase conversations for cold open and **Run Partner Demo** come from **`testing.json`** only (repo root canonical; deployable copy here for Vercel).

| File | Format | Notes |
|------|--------|--------|
| `testing.json` | Sioona-shaped JSON | ~41 labeled finance chats; cold open + Partner Demo + reset seed. Keep in sync with repo-root `testing.json`. |
| `partner-shaped-labeled.csv` | Sioona CSV + `ground_truth` | Messier partner-like multi-turn pack for labeled P/R vs synthetics |
| `real-partner-export.template.csv` | Sioona CSV + `ground_truth` | Redacted template for Day-1 pilot exports (safe to commit) |
| `real-partner-export.local.csv` | Sioona CSV + `ground_truth` | **Gitignored** week-1 drop-in — paste redacted partner chats here |
| `real-partner-export.week2.local.csv` | Sioona CSV + `ground_truth` | **Gitignored** week-2 held-out drop-in — does not overwrite week-1 |

Upload still accepts partner CSV / Intercom JSON / WhatsApp `.txt` — those formats are parsers, not bundled showcase files.

## Lead vs upsell (label policy)

- **Lead** — new-product acquisition **or** same-product expansion: premium / plan upgrade, credit or spending **limit** raise, **add-on** / supplementary card.
- **Upsell** — adjacent product alongside what they already hold: F&O / margin / MTF, loan against shares (LAS), premium advisory / PMS, insurance + FD alongside wallet/account, family / joint account.
- **Retention** — close / delete / switch / funds-out / refund frustration with churn risk.
- **None** — ops (password, OTP, app crash, pending txn) and pure support (“chat support”, ticket help).

Broking / wealth wedge: demat account opening, brokerage/fee questions, “close / shift broker” churn, and F&O / margin / family-account upsell — plus ops tickets that should **not** fire a revenue signal.

Samples include PII-shaped values (phone, email, PAN). Ingest runs
`redactText` (`src/lib/redact.ts`) before anything is stored, so stored messages
show `[phone]` / `[email]` / `[pan]` while detection still works on the redacted text.

After upload, review signals on `/insights`, then precision on `/eval`. Start FastAPI so Neon dual-write fills the needs-review queue.

## Partner-shaped labeled pack (eval baseline)

`partner-shaped-labeled.csv` is a **measurement** pack (not a P/R = 1.0 gate). It mirrors partner exports: multi-turn noise, soft phrasing, support suppressors, broking + fintech CS, PII-shaped values redacted on ingest.

| Mix | Count |
|-----|------:|
| Labeled conversations | 16 |
| lead | 4 |
| retention | 3 |
| upsell | 3 |
| none | 6 |

Run from `web/`:

```bash
npx vitest run src/lib/partner-pack.eval.test.ts
```

Synthetic fixture gate (still must stay at 1.0) — test-only pack in `src/data/fixtures/detect-eval-fixtures.ts`:

```bash
npx vitest run src/lib/eval.test.ts src/lib/detect.test.ts
```

Root corpus `testing.json` (41 labeled finance chats; measurement, not a 1.0 gate):

```bash
npx vitest run src/lib/testing-json.eval.test.ts
```

Loader: [`src/lib/testing-json-eval.ts`](../../src/lib/testing-json-eval.ts) — maps corpus `labels[]` → product `groundTruth`, then ingest → detect → metrics. Runtime prefers `web/data/samples/testing.json`, then repo root.

### Baseline metrics (keyword detect, 2026-08-10)

| Scope | Precision | Recall | Notes |
|-------|----------:|-------:|-------|
| Overall | 1.00 | 1.00 | TP 10 / FP 0 / FN 0 |
| lead | 1.00 | 1.00 | |
| retention | 1.00 | 1.00 | |
| upsell | 1.00 | 1.00 | Includes wallet + insurance/FD adjacent upsell (`ps_upsell_ins`) |

Optional UI path: upload the same CSV via `/upload`, then read labeled metrics on Eval (`/?view=eval&panel=labeled`).

## Real partner export eval lane (Day-1 pilots)

Use this when a partner sends a chat export. **Never commit real PII** — redact first (or rely on ingest `redactText`), then label `ground_truth`.

### Drop-in steps

1. Copy the template:
   ```bash
   cp data/samples/real-partner-export.template.csv data/samples/real-partner-export.local.csv
   ```
2. Replace rows with **redacted** partner transcripts. Keep columns:
   `conversation_id,role,content,customer_name,channel,timestamp,ground_truth`
3. Set `ground_truth` to `lead` | `retention` | `upsell` | `none` per the label policy above.
4. Score from `web/`:
   ```bash
   npm run eval:partner-export
   ```
   Prefers gitignored `real-partner-export.local.csv`, else the committed template. Prints heuristic (base) + FP/FN, then **heuristic (adapt)** from [`partner-export-overrides.ts`](../../src/data/fixtures/partner-export-overrides.ts) on local.csv (same merge as store `taxonomyOverrides` / Eval Adapt-from-reviews). Hybrid Detect v2 only when `DETECT_LLM=1` and `GROQ_API_KEY` are already set (otherwise `hybrid=skipped`). Unit tests inject `classify` and never call Groq. **Never commit `.local.csv`.** Template P/R is measurement only — not customer recall. Do not expand `taxonomy.ts` to chase this pack.
   ```bash
   npx vitest run src/lib/partner-export.eval.test.ts
   ```
   Or in a Node/TS scratch:
   ```ts
   import { loadPartnerExportEval, formatPartnerExportEval } from "@/lib/partner-export-eval";
   const result = await loadPartnerExportEval(); // prefers .local.csv if present
   console.log(formatPartnerExportEval(result));
   ```

Loader: [`src/lib/partner-export-eval.ts`](../../src/lib/partner-export-eval.ts) — ingest → heuristic detect → optional Adapt overrides (local.csv) → optional `runHybridDetection` → `computeEvalMetrics`. Prefers `real-partner-export.local.csv`, else the committed template. Eval is measurement only (no Neon dual-write).

This lane is a **measurement baseline** (not a P/R = 1.0 gate). Signal Score review precision remains FastAPI + Neon after upload/feedback.

Optional UI: upload the same CSV via `/upload`, then read labeled metrics on Eval.

## Week-2 held-out eval lane

Score a second redacted partner drop without overwriting week-1 `real-partner-export.local.csv`.

### Drop-in steps

1. Copy the template (separate file from week-1):
   ```bash
   cp data/samples/real-partner-export.template.csv data/samples/real-partner-export.week2.local.csv
   ```
2. Replace rows with **redacted** week-2 partner transcripts. Keep the same columns and `ground_truth` label policy as week-1.
3. Score from `web/`:
   ```bash
   npm run eval:partner-export -- --week2
   # or: PARTNER_EXPORT=week2 npm run eval:partner-export
   ```
   Requires `real-partner-export.week2.local.csv`. Prints `source=week2` with heuristic (base) + **heuristic (adapt)** from the same [`partner-export-overrides.ts`](../../src/data/fixtures/partner-export-overrides.ts) fixture as week-1 local (not copied into `taxonomy.ts`). Missing week2 file → clear error (does **not** silently score week-1). Default `npm run eval:partner-export` still prefers week-1 `real-partner-export.local.csv`. **Never commit `*.local.csv` / PII.**

