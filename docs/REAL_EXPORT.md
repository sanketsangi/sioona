# One real redacted partner export

Run this once on a file the partner has already redacted, then confirm Sioona did not put raw names or contact identifiers into the store or the model prompt.

## Checklist

1. Set `SIOONA_TENANT_ID` to a new id such as `tenant_partner`. Do not reuse `tenant_demo`.
2. Sign in as the admin or reviewer for that tenant (`/login`).
3. Upload one CSV, Intercom JSON, or WhatsApp `.txt` from Upload. Use a filename like `real-partner-export.local.csv` or `{company}_week_{n}_batch_{m}.json`. Sample packs (`Groww_batch_02`, `zerodha_batch_02`) are the demo path and are not this checklist.
4. Confirm the upload response is 200. If it says Neon did not store every chat, retry after the API is awake. A 502 means the file is on disk and Neon rejected the write.
5. Open a chat. The customer label is `Customer` plus 8 hex characters. Message text has `[phone]`, `[email]`, `[upi]`, `[ifsc]`, `[client-code]`, `[dob]`, or `[address]` where those patterns matched. Evidence quotes should still read as sentences.
6. Review a signal (Correct / Incorrect / Partial). Record an outcome: retained, churned, converted, no change, or unknown. Add a rupee amount only when you know it.
7. Open Eval. SignalScore is unchanged. Under it, **Revenue at risk found** sums retention amounts marked retained, churned, or unknown. **Revenue saved** sums amounts marked retained or converted.
8. Do not click Apply Scored Adapt or Apply Zerodha Adapt on this file. Those packs stay off a live partner export. Add a phrase from the review if detection is wrong.

Sample Adapt fixtures (`partner-export-overrides.ts`, `zerodha-batch01-overrides.ts`) are not applied on upload or hydrate. The Eval CLI can still pass them when you explicitly score a historical sample pack.

## What this does not do

It does not call Intercom or WhatsApp, send a message, or replace the partner's own redaction. Treat the pseudonym and the pattern list as a second pass.
