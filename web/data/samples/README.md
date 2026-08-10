# Partner sample pack

Use these when you don’t have a real partner export yet. Upload via `/upload`, or click **Run Partner Demo** (loads Intercom + WhatsApp on top of fixtures).

| File | Format | Notes |
|------|--------|--------|
| `sample-upload.csv` | Sioona CSV | `conversation_id, role, content` (+ optional columns); lead / retention / upsell / ops rows |
| `partner-shaped-labeled.csv` | Sioona CSV + `ground_truth` | Messier partner-like multi-turn pack for labeled P/R vs synthetics |
| `real-partner-export.template.csv` | Sioona CSV + `ground_truth` | Redacted template for Day-1 pilot exports (safe to commit) |
| `real-partner-export.local.csv` | Sioona CSV + `ground_truth` | **Gitignored** drop-in — paste redacted partner chats here |
| `sample-intercom.json` | Intercom JSON | `source` + `conversation_parts`; demat lead → churn → F&O upsell |
| `sample-whatsapp.txt` | WhatsApp Business `.txt` | `You` = agent; premium advisory upsell thread |

## Lead vs upsell (label policy)

- **Lead** — new-product acquisition **or** same-product expansion: premium / plan upgrade, credit or spending **limit** raise, **add-on** / supplementary card.
- **Upsell** — adjacent product alongside what they already hold: F&O / margin / MTF, loan against shares (LAS), premium advisory / PMS, insurance + FD alongside wallet/account, family / joint account.
- **Retention** — close / delete / switch / funds-out / refund frustration with churn risk.
- **None** — ops (password, OTP, app crash, pending txn) and pure support (“chat support”, ticket help).

Broking / wealth wedge: demat account opening, brokerage/fee questions, “close / shift broker” churn, and F&O / margin / family-account upsell — plus ops tickets that should **not** fire a revenue signal.

Fintech CS wedge (in `sample-upload.csv`): wallet / UPI / credit-card onboarding (lead), failed refund + “delete my account” / “switching to another app” (retention), and premium-plus / credit-limit / add-on card (**lead**, not upsell) — plus a “transaction pending / refund already processed” ops row that must stay a hard negative.

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

Synthetic fixture gate (still must stay at 1.0):

```bash
npx vitest run src/lib/eval.test.ts src/lib/detect.test.ts
```

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
   npx vitest run src/lib/partner-export.eval.test.ts
   ```
   Or in a Node/TS scratch:
   ```ts
   import { loadPartnerExportEval, formatPartnerExportMetrics } from "@/lib/partner-export-eval";
   const result = loadPartnerExportEval(); // prefers .local.csv if present
   console.log(result.source, formatPartnerExportMetrics(result.metrics));
   ```

Loader: [`src/lib/partner-export-eval.ts`](../../src/lib/partner-export-eval.ts) — ingest → detect → `computeEvalMetrics` (overall + per-type). Prefers `real-partner-export.local.csv`, else the committed template.

This lane is a **measurement baseline** (not a P/R = 1.0 gate). Signal Score review precision remains FastAPI + Neon after upload/feedback.

Optional UI: upload the same CSV via `/upload`, then read labeled metrics on Eval.
