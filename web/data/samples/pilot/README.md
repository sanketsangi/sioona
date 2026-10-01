# Kuber Securities week-1 pilot pack

Fictional mid-market Indian broker. Not a real brand, and not customer data.

Use this pack to rehearse a Shadow Mode pilot on `tenant_partner`: upload, review, record outcomes, then read Eval. It does not replace the Groww or Zerodha showcase files, and it does not change Reset Demo.

Week of 21–27 Sep 2026. Upload file: `kuber_week_1_batch_1.csv`.

## Files

| File | Parser | What it is |
|------|--------|------------|
| `kuber_week_1_batch_1.csv` | Sioona CSV | Full week. 120 conversations. Columns match `real-partner-export.template.csv`, including `ground_truth`. |
| `kuber_week_1_intercom.json` | Intercom JSON | The same 20-conversation subset, with `source` + `conversation_parts`. One internal note is included so the note path is exercised. |
| `kuber_week_1_whatsapp.txt` | WhatsApp `.txt` | That same subset in export lines (`[dd/mm/yyyy, h:mm:ss AM] Name: ...`, business side as `You`). |

`parseWhatsappTxt` stores one conversation per file, which is how a WhatsApp export is shaped. The `.txt` is here so that parser runs on a real export, including the encryption banner it skips. Review the week on the CSV or the Intercom JSON.

## Labels

Ground truth follows the sample label policy: lead = new account or same-product expansion, upsell = an adjacent product, retention = close / switch / funds-out, none = ops and pure support.

| Label | Conversations |
|-------|--------------:|
| retention | 25 |
| lead | 15 |
| upsell | 15 |
| none | 65 |
| **Total** | **120** |

Ops tickets that should stay `none`: OTP, password reset, app crash, KYC pending, and contract-note requests. Ids are `kuber_w1_ops_*` (20 chats).

## Language

Counted from customer text. A chat with any Devanagari is Hindi. Roman Hindi markers (hai, nahi, bhai, bahut, paisa, and similar) make Hinglish. The rest is English.

| Language | Conversations | Share |
|----------|--------------:|------:|
| English | 60 | 50% |
| Hinglish (Roman) | 42 | 35% |
| Hindi (Devanagari) | 18 | 15% |

Examples in the pack: "paisa nikalna hai", "Zerodha pe shift kar raha hoon", "brokerage bahut zyada hai", "MTF ka rate kya hai", and Devanagari "पैसा निकालना है".

## Money and time

30 of the 55 signal chats state a rupee amount or portfolio size the commercial parsers can read (`₹8 lakh`, `₹50,000`, `₹1.1 crore`). A few also say "50k" the way a customer would. 41 signal chats name a timeframe (`by Friday`, `this week`, `today`, `is mahine`, `aaj`).

## Early-warning customers

Eight customers each appear in 2–4 chats. Tone, payouts, and complaints move across the week so an at-risk view has a trail. Names are fictional.

| Customer | Chats | What repeats |
|----------|------:|--------------|
| Meera Kulkarni | 4 | Polite ₹50,000 withdrawal, then "withdrawal pending" / "paisa nahi", then "still waiting" with a 5-hour reply, then angry close-my-account. |
| Arjun Deshmukh | 3 | Contract-note complaint, then "brokerage bahut zyada", then "shifting to another broker". |
| Fatima Qureshi | 3 | App crash, then "every time" / "still waiting", then "switch to another app". |
| Harpreet Singh | 2 | Contract note with a 5-hour reply, then "no reply" and "move my money". |
| Lakshmi Iyer | 3 | Family account plus loan against shares, a bad form, then margin trading facility. Later chat is harsher. |
| Nikhil Bansal | 2 | Demat opening, then still waiting on the same link. |
| Pooja Reddy | 3 | MTF screen complaints, then enable F&O inside the brokerage complaint. |
| Rahul Menon | 3 | ₹75,000 withdrawal, then pending / not credited, then "transfer my holdings out". |

## Hard cases

| Id | Label | Why it is hard |
|----|-------|----------------|
| `kuber_w1_hc_soft` | retention | Soft churn only: "thinking of other options." No close / switch line. |
| `kuber_w1_hc_sarcasm` | retention | Sarcastic praise of a nine-day payout. The exit is in the tone. |
| `kuber_w1_hc_buried` | retention | 14 messages about a contract note. "Close my account" shows up near the end. |
| `kuber_w1_hc_lead_mix` | lead | "This is unacceptable" and, in the same chat, open a demat for his father. |
| `kuber_w1_pooja_03` | upsell | Brokerage complaint ("not happy", "bahut zyada") plus enable F&O / MTF. |
| `kuber_w1_ret_silent` | retention | Customer-only thread. Nobody from the desk replies. |
| `kuber_w1_ret_hi_01` | retention | Hindi in Devanagari, with no English churn phrase. |

## Redaction

Every phone, email, PAN, UPI, IFSC, client code, DOB, address, PIN, Aadhaar, and account number is fake (`98…` mobiles that are still 10 digits, `@example.com`, `ZZZZZ0001A`, `@ybl` / `@oksbi` / `@paytm` / `@okaxis`). Ingest runs `redactText` before anything is stored. After upload the customer label is `Customer` plus 8 hex characters, and those values should be `[phone]`, `[email]`, `[pan]`, `[upi]`, `[ifsc]`, `[broker-id]`, `[dob]`, `[address]`, `[pin]`, `[aadhaar]`, or `[account]`.

## Rehearsal

1. Set `SIOONA_TENANT_ID` to `tenant_partner`. Do not use `tenant_demo`.
2. Sign in as that tenant's admin or reviewer.
3. Upload `kuber_week_1_batch_1.csv`. Optionally upload the Intercom JSON and the WhatsApp `.txt` so each parser runs. Confirm the response is 200.
4. Open a chat. The name is a pseudonym. PII-shaped values in the text are masked. Evidence quotes should still read as sentences.
5. Review 10 signals (Correct / Incorrect / Partial).
6. Record 5 outcomes (retained, churned, converted, no change, or unknown). Enter a ₹ amount on each.
7. Open Eval. Read SignalScore, and the revenue-at-risk and revenue-saved figures under it.
8. Open the leak report for this file. The ₹ amounts, timeframes, and the eight repeat customers above are the trail it should find.

Do not click Apply Scored Adapt or Apply Zerodha Adapt on this file.

## Measurement

Heuristic precision and recall are a baseline, not a pass/fail gate. Do not expand `taxonomy.ts` to chase this pack. From `web/`:

```bash
npx vitest run src/lib/kuber-pilot.eval.test.ts
```

The test prints `kuber-pilot heuristic` with overall and per-label precision and recall. On the pack as committed, keyword detect scored:

| Scope | Precision | Recall |
|-------|----------:|-------:|
| Overall | 0.98 | 0.82 |
| lead | 1.00 | 0.87 |
| retention | 1.00 | 0.76 |
| upsell | 0.93 | 0.87 |

That is a measurement snapshot (45 true positives, 1 false positive, 10 false negatives). Soft churn, sarcasm, and Devanagari threads are expected misses. It is not a gate.
