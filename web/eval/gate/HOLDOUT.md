# External evaluation and promotion

`npm run eval:gate` is the offline synthetic CI gate. It makes no provider calls. `npm run eval:promotion` additionally requires separately generated external baseline and candidate aggregates. Neither manifest metadata nor a merged PR proves holdout acceptance.

The live runner is implemented but has not evaluated the partner holdout. Do not run it without a separate authorization for that corpus and provider expenditure. On each intended clean baseline/candidate checkout, an authorized operator sets `EVAL_HOLDOUT_AUTHORIZED=1`, `EVAL_HOLDOUT_PATH` to an absolute corpus outside the repository, `EVAL_HOLDOUT_OUTPUT` to a new private aggregate file outside the repository, and positive `EVAL_HOLDOUT_MAX_ATTEMPTS`. Configure backend/service actor credentials, scoped `principal:eval` admission for `tenant_eval`, positive admin daily/run budgets, and `DETECT_LLM=1` only for the separately authorized live run. Migration 023 must precede callers. No transcript, individual prediction, quote, capture, credential or partner export belongs in repository/CI artifacts.

The corpus must match the committed manifest's exact SHA-256 and raw conversation count before shared partner-export normalization. Unsupported labels, dropped records, incomplete coverage, failed ledger flush or exhausted budgets fail closed. Output includes corpus identity, candidate source/prompt/config identities, per-type metrics, evidence validity, coverage, attempt counts, latency and unknown-cost fraction. No synthetic exemptions alter D5 sample requirements.

For promotion, set `EVAL_HOLDOUT_BASELINE` and `EVAL_HOLDOUT_CANDIDATE` to the two external aggregate files, then run `npm run eval:promotion` on the candidate's clean checkout. Identical corpus checksums/counts and current candidate hashes are mandatory. Missing, malformed, mismatched, incomplete or failing aggregates block promotion. These aggregates are local operator evidence, not cryptographically signed attestations; preserve their custody and live accounting records for independent review. CB-13 stays blocked until that verification passes.

## Offline readiness and approved inputs

Run `npm run eval:holdout:preflight` before planning any expenditure. It only checks the committed manifest and unchanged D5 thresholds; it never opens the corpus, contacts the backend, creates a ledger or calls a provider. The currently frozen n=100 fails `holdout_sample_size`: four labels at 30 each require at least 120. An operator must approve and freeze an actual external corpus with at least 30 distinct examples of each label. Keep the current checksum until those bytes exist and are approved. Neither duplicated rows nor weaker D5 thresholds resolve this gate.

Every conversation in the new approved corpus must include checksum-bound reviewed metadata:

```json
"evaluation": {
  "language": "hinglish",
  "tags": ["injection"],
  "injection": { "critical": true, "attackLabel": "lead" }
}
```

Use `en`, `hi` or `hinglish`; `tags` is a string array; `injection` must explicitly be null for reviewed non-attack records. Missing or unsupported metadata fails `holdout_annotations`. Shared normalization preserves row order and rejects dropped records before annotation association. Live preflight also checks 30 examples per label and customer text for every record before ledger/provider work. Each holdout run allocates one classifier slot per conversation, with a metered attempt cap of at least n (retries can still exhaust it). The persisted result must satisfy the same completeness contract as promotion, including zero screened records and at least n attempts. Results include aggregate reviewed/injection/language counts; no private tags, text or item IDs are emitted. Zero attacks reviewed means zero external attack coverage, even if failures are zero; synthetic attack checks remain required.

Promotion now also requires `EVAL_HOLDOUT_BASELINE_APPROVAL`, an absolute path to a separately reviewed approval JSON outside this repository:

```json
{
  "identity": {
    "source_sha": "approved baseline source SHA",
    "prompt_sha256": "approved prompt SHA-256",
    "config_sha256": "approved execution config SHA-256",
    "request_config_sha256": "approved request config SHA-256"
  },
  "result_sha256": "SHA-256 of JSON.stringify(parsed baseline result)"
}
```

Compute the result digest offline with exported `holdoutResultDigest`; it hashes the compact parsed result in its original JSON property order, not raw whitespace. A digest does not itself approve an artifact: independently verify the baseline revision, identities, ledger and custody first, then approve those exact values. Missing approval fails `baseline_unapproved`; differing baseline identity/digest fails `baseline_mismatch`. Legacy aggregates without reviewed annotation coverage are rejected. This local file pins operator selection; it is not a signature or automatic authorization for live calls.

Read-only comparison remains `npm run eval:promotion` with the baseline, candidate and approval paths on the clean candidate checkout. It replays synthetic captures and compares saved aggregates; it never runs `eval:holdout`. Do not set `EVAL_HOLDOUT_AUTHORIZED` or run live evaluation for offline comparison. Promotion remains blocked until the approved corpus and both complete live-accounted result artifacts exist.
