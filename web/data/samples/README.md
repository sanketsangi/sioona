# Partner sample pack

Use these when you don’t have a real partner export yet. Upload via `/upload`, or click **Run Partner Demo** (loads Intercom + WhatsApp on top of fixtures).

| File | Format | Notes |
|------|--------|--------|
| `sample-upload.csv` | Sioona CSV | `conversation_id, role, content` (+ optional columns); lead / retention / upsell / ops rows |
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
