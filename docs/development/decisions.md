# Decisions

## Approved operating and launch decisions — 2026-10-16

Approver: **Sanket**, explicit approval in this session. These choices close decision inputs; they do not assert hosted execution or authorize account upgrades, resource spend, live customer ingestion, or external writes.

- Reject populated Neon `sioona-actor-staging` (`fragrant-voice-56460486`). Preserve it unchanged. Require a **new, empty target with zero application rows**, alongside Render workspace **Sioona** (`tea-d9t31uugekts73clssa0`). Record target IDs and zero-row proof before migrating through `033_supervised_action_executions`, then seed synthetic memberships. A schema-only clone is not an unmigrated empty database; record its exact state. The telemetry closeout additionally requires additive `034_operational_telemetry` **before** deploying these handlers. Exact hosting SKU, recurring cost and actual provisioning remain operator gates; no provider stack is selected implicitly.
- Pilot recovery targets: **RTO 4 hours; RPO 24 hours**. Provider backup retention/expiry remains natural; no immediate backup scrubbing promise. Confirm the selected plan and backup cadence can meet RPO and rehearse restore; targets are not achieved measurements. Require a **direct, session-preserving Postgres connection** for CB-18 session advisory export locks (transaction pooling is insufficient). No customer uptime SLA until **60 days of telemetry**, followed by explicit approval.
- Initial tenant attempt-mode operating policy: **500 attempts/day**, **120 attempts/run**, **Asia/Kolkata** budget day, pause propagation **≤60 seconds**, switch/alert owner **Sanket**. These are approved initial configuration values, not automatic enablement: unconfigured tenants and controls remain fail-closed. Operator configures scoped limits explicitly; USD enforcement remains disabled without an approved evaluated output ceiling.
- Keep baseline `qwen/qwen3.8-27b`; no prompt/model/route change. Candidate promotion **CB-13 / OP-5 is deferred** until an approved external corpus has **n ≥120 and ≥30 per retention/upsell/lead/none**, baseline identity/checksum and bounded evaluation authorization. Existing n=100 is insufficient.
- Accept **chunked standard-call historical worker execution as complete CB-14 scope**. No remote provider Batch API adapter is required. Hosted worker enablement still waits for signed CB-10 acceptance and a separate operator go; retain `SIOONA_DETECTION_EXECUTION=inline`, `SIOONA_WORKER_PAUSE=1` for that rollout policy.
- Keep `LIVE_INGEST=0` and `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`. CB-16 enablement needs customer consent, workspace credentials and hosted acceptance. CB-17 needs approved live sandbox credentials/allowlisted targets and explicit exact-payload approval for each sandbox write. Ordinary Approve Draft sends nothing.
- Official Groq model/pricing and caching documentation was rechecked on **2026-10-16**. The uncommitted draft's four prices/cached discounts were not verified. Publish only Qwen **$0.80 input / $4.00 output per million tokens**, no supported cached discount, and GPT-OSS 20B **$0.075 input / $0.30 output**, with **$0.037 cached input** as published on the model-specific page (the generic caching page describes an approximately 50% discount). Rates begin on the verification date; older/unknown models remain unknown and existing ledger rows are not silently repriced. Sources: [Qwen](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [GPT-OSS 20B](https://console.groq.com/docs/model/openai/gpt-oss-20b), [caching](https://console.groq.com/docs/prompt-caching). The legacy `meta/llama-3.3-70b-versatile` ID and DeepSeek candidate lack verified current prices and remain unknown.

### Hosted acceptance still required (superseded summary)

The authoritative current list is
[`LAUNCH_BLOCKERS_2026-10-17.md`](LAUNCH_BLOCKERS_2026-10-17.md). The bullets
below preserve the 2026-10-16 decision closeout and must not be used as a
second launch-blocker list.

- **OP-1:** current entitlement/protection readback, enforced review/check rules. No GitHub Pro purchase authorized by the attached checklist alone.
- **OP-2:** approved exact empty staging target/cost/backup plan, deployment and synthetic membership seed, observed ≥30-minute actor shadow journey, enforce-mode revocation/permission checks and sign-off.
- **OP-3:** human-run schema/current verification, owner/runtime URL separation, forced-RLS tenant A/B/missing-context/connection-reuse proof; CB-10 entity reconciliation, single writer, restart/outage proof without runtime JSON and Sanket's sign-off.
- **OP-4:** hosted pause propagation/exhaustion/outage/resumption/concurrent admission, provider/ledger reconciliation, worker/drill and alert-delivery acceptance.
- **OP-5:** deliberately deferred external corpus/baseline/candidate comparison and authorized canary; no synthetic substitute.
- **Hosted staging/production sign-off:** lifecycle export/deletion/holds/backup restore, measured recovery against RTO/RPO, source evidence reconstruction, consent/sandbox enablement where applicable, exact-revision CI/review and post-release upload → review smoke. Local tests do not close these gates.

---

Agents do not invent these. A row is approved only when it has a date and an approver. Until then the choice is proposed and the current files stay as they are.

## D0 — Authorize the foundations heading

Status: **approved**
Date: 2026-10-07
Approver: Sanket
Choice: approved as drafted

Approving D0 means all of the following, and nothing else:

- Freeze net-new feature work for one foundation sprint. The pilot loop keeps running: upload, Insights / Shadow Mode, Correct / Incorrect / Partially Correct, Mark Acted (display-only), outcome, Eval week-window keep-set.
- Apply the diffs below. Do not apply them before this row is approved.
- Leave the customer claim unchanged: human keep-set SignalScore ≥80% with n ≥ 5 on the Eval week window (`correct / reviewed`; partial and incorrect count in the denominator only).

CB-00 drafted the text. D0 was approved and its five After blocks applied on 2026-10-07 by explicit user instruction.

### `.cursor/docs/PROJECT_STATE.md` §0

Before (lines 14–18, prior to D0 approval):

```markdown
**GTM now:** Offer = single-tenant Insights + Shadow Mode + human-gated suggestions (no autonomy, no Auth0 sell). Approve Draft / Correct / Mark Acted = human gate only — Approve is decision-only (never sends); Acted is display-only (no outbound). Win = human keep-set SignalScore ≥80% on Eval (week window). Primary job = next unused weekly dump after Week-6 (Batch-02 still held-out). Residual gap = Week-7+ real partner export (Batch-02 held-out).

**Heading: 2-week Shadow Mode pilot.** Pilot win = human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 / vLLM / Action Mode outbound. Taxonomy still JSON.
```

After (approved and applied 2026-10-07):

```markdown
**GTM now:** Offer = single-tenant Insights + Shadow Mode + human-gated suggestions (no autonomy, no Auth0 sell). Approve Draft / Correct / Mark Acted = human gate only — Approve is decision-only (never sends); Acted is display-only (no outbound). Win = human keep-set SignalScore ≥80% on Eval (week window). Primary job = next unused weekly dump after Week-6 (Batch-02 still held-out). Residual gap = Week-7+ real partner export (Batch-02 held-out).

**Heading: foundation sprint, then the Shadow Mode pilot.** Pilot win is unchanged: human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion. Net-new product features wait. Approved cards may add tenant membership, a model gateway, inference metering, evidence anchors, an eval gate, and canonical Postgres state. Nothing auto-sends.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 as the identity vendor / vLLM / Action Mode outbound. Taxonomy base is still `taxonomy.ts`.
```

### `.cursor/docs/PROJECT_STATE.md` §3 governance sentence

Before (line 284, prior to D0 approval):

```markdown
Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Do **not** move classify to FastAPI / add 429 retries / Create Groq project limits.
```

After (approved and applied 2026-10-07):

```markdown
Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Moving classification onto a worker is CB-11. Further Groq retry and budget work is CB-07. Do not start either outside those cards. Do not create Groq project limits from an agent session.
```

The detect-mode paragraph above this sentence was a factual CB-00 edit and is already applied. This governance sentence was applied with D0 approval on 2026-10-07.

### `.cursor/docs/PROJECT_STATE.md` §7

Before (lines 369–379, prior to D0 approval):

```markdown
## 7. Later / do not start

*(Unchanged 2026-09-04 — review-friction pass did not start any of these.)*

- Auth0 / real tenant isolation
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode outbound send (unlocked Action Mode = Insights Act queue only; prod locked)
- Export / Create Campaign (unshipped — hidden, not overflow)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / classify-on-FastAPI / 429 retries / Groq project limits / taxonomy-on-Neon
```

After (approved and applied 2026-10-07):

```markdown
## 7. Later / do not start

*(D0, once approved, allows the foundation cards below. Everything else in this list stays blocked.)*

- Auth0 as a vendor (identity work is CB-03: Postgres users and memberships, not a new IdP, until D1 says otherwise)
- Real tenant isolation is in scope for CB-03 and CB-04 only
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp: CB-16 only, after D10, still off unless `LIVE_INGEST=1`
- Action Mode outbound send (unlocked Action Mode = Insights Act queue only; prod locked). External send is CB-17 only, after D10
- Export / Create Campaign (unshipped — hidden, not overflow)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / Groq project limits
- Classify-on-a-worker is CB-11. Budgets and 429 policy are CB-07. Taxonomy-on-Neon as source of truth stays blocked (overrides already persist in Neon)
```

### `.cursor/rules/architect.mdc` line 46

Before (prior to D0 approval):

```markdown
- Tenancy today = `X-Tenant-Id` (`tenant_demo`); do **not** start Auth0 / real multi-tenant isolation
```

After (approved and applied 2026-10-07):

```markdown
- Tenancy today = asserted `X-Tenant-Id` plus a shared service token. D0 allows CB-03 and CB-04 (staged Postgres users/memberships, then RLS). Do not start Auth0 unless D1 is revised. Do not treat a tenant header as authority
```

### `.cursor/rules/evaluation-metrics.mdc` line 78

Before (prior to D0 approval):

```markdown
- Do not implement full Precision/Recall pipelines unless explicitly asked
```

After (approved and applied 2026-10-07):

```markdown
- Labeled precision/recall is never the pilot go/no-go. D0 is the explicit ask for the CB-09 offline eval gate only. Do not add a general ML evaluation framework beyond that card
```

Line 77 stays: "Do not treat labeled P/R as the pilot go/no-go".

## D1 — Identity approach

Status: **approved**
Date: 2026-10-08
Approver: Sanket
Choice: **Staged identity.** Postgres users and memberships are the role authority. Next.js mints a short-lived signed actor assertion for FastAPI. Password checks stay in web. A managed IdP can come later behind the same membership model. Do not start Auth0 in this decision.

- Assertion: HS256, header `X-Sioona-Actor`, claims `iss=sioona-web`, `aud=sioona-api`, `sub`, `tid`, `iat`, `exp`, `jti`. Lifetime: 60 seconds. Stop sending `X-Sioona-Role`. Keep the service token.
- Demo membership may read. It may not review or administer.
- Recovery cron and live ingest each get a named service principal with an allowed-operation list, not an admin role.
- Rollout: `SIOONA_ACTOR_AUTH=off|shadow|enforce`. Production enforce waits for a clean shadow window.
- Key rotation procedure — **Proposed:** one current HMAC key plus one previous key accepted only during rotation, changed by a human environment update.

## D2 — Ledger write mode while inference runs in web

Status: **approved**
Date: 2026-10-08
Approver: Sanket
Choice: **Buffered per-run flush.** The web process buffers one `AttemptSink` per detection run and flushes it in `finally`. Rows are idempotent on `(tenant_id, attempt_id)`. A finalized row never reverts to `pending`. Before the LLM pass, preflight the ledger. If it is unreachable, skip the LLM and run heuristics only, and record `ledgerSkip=unreachable` on the pass stats. The crash window between a provider call and a successful flush is a known gap until CB-11 writes `pending` before the call. Alerting for a failed flush is a counts-only log (`sioona.inference_ledger.flush_failed`) until CB-15.

## D3 — Evidence offsets and message mutability

Status: **approved**
Date: 2026-10-08
Approver: Sanket
Choice: Unicode **code-point** offsets, half-open `[start, end)`, over exact persisted `messages.content`. Add `messages.content_sha256`. A content change makes anchors **stale**: show "source changed" and re-detect, never re-anchor silently.

## D5 — Eval corpus and thresholds

Status: **approved**
Date: 2026-10-09
Approver: Sanket
Choice: **Synthetic corpus in the repo. Partner-derived holdout outside the repo, with only its checksum and n in the manifest.** Thresholds are the CB-09 scaffold: at most a 2 percentage-point precision drop and a 2 percentage-point recall drop per type, surfaced evidence validity 1.0, zero injection critical failures, zero tenant failures, `require_holdout: true`, and at least 30 items per type. A missing required holdout fails the gate. Do not invent a partner checksum or n. Labeled precision/recall stays the engineering gate; human keep-set SignalScore stays the customer claim.

## D7 — Python lock tool

Status: **approved**
Date: 2026-10-07
Approver: Sanket
Choice: `uv pip compile --universal --python-version 3.12 --generate-hashes`, writing `requirements.txt` from `requirements.in`. CI and Render stay `pip install -r requirements.txt`. pip-tools was the acceptable alternative and was not chosen.

## D4 — Fail-closed budgets and kill switch

Status: **approved**. Date: 2026-10-10. Approver and switch owner: Sanket.

Initial enforcement is per-tenant daily and per-run **attempt** limits, with the budget day in `Asia/Kolkata`. Tenant inference remains disabled until an admin configures positive limits. Check controls before every provider attempt; cache at most 30 seconds (initial implementation has no cache), propagation bound 60 seconds. Atomically reserve each retry/fallback and persist the matching pending ledger row before dispatch; ambiguous calls never refund allowance. USD mode remains unavailable until official rates and an eval-validated output ceiling are approved. Schema-first human deployment, scoped runtime admission and admin-only controls are required. See [CB-07](tasks/CB-07.md).

D2 implementation addendum (2026-10-10): CB-07 admission now writes `pending` before dispatch, closing the buffered-only crash window without waiting for CB-11. Finalized attempts still flush idempotently in `finally`.

D4 implementation addendum (2026-10-10, `12458d1`): Global pause is an unlocked read plus a post–tenant-lock recheck; **never** lock the global `InferenceControl` row in `reserve()` (throughput). Ordinals and admission-id metering align with ledger validation; prompt-injection rejects do not increment LLM failure stats. Rationale table: [CB-07 internal changelog](tasks/CB-07.md#internal-changelog--admission-pipeline-remediation-12458d1-merged-5e93be5).

## D6 — Postgres cutover order

Status: **approved**
Date: 2026-10-12
Approver: Sanket
Choice: Conversations/messages → feedback/decisions → pilot settings → taxonomy overrides → remaining JSON. In production mode, Postgres is the only writer for operational state. JSON remains only for local demo mode. Production refuses `json-demo` at boot. A fresh production tenant reconstructs the dashboard after a web restart with no runtime JSON file. Demo or sample data cannot overwrite a live tenant.

## D8 — Row level security

Status: **approved**
Date: 2026-10-12
Approver: Sanket
Choice: **Adopt** on `messages`, `conversations`, `signal_predictions`, `signal_feedback`, `supervised_action_decisions`, `detection_runs`, `inference_attempts`, and `signal_evidence`, using runtime role `sioona_runtime` (`NOBYPASSRLS`, distinct from the migration owner). Missing `app.tenant_id` returns no rows. Hosted `DATABASE_URL` stays on the owner until the operator switch in [Phase 2 go](PHASE_2_GO.md) item OP-3. Evidence: CB-04 and merge of #154 / #155.

## D9 — Durable job runtime and background execution (CB-11)

Status: **approved**
Date: 2026-10-14
Approver: Sanket
Proposal revision: v1.0
Choice: **Postgres `jobs` table with `FOR UPDATE SKIP LOCKED` and a Render background worker built from the same FastAPI backend revision (no external broker).**

### Scope and Invariants

- **Outbox & Canonical Commit Boundary:** Enqueue `jobs` rows with bounded references only (`tenant_id`, `job_type`, `upload_id`, `conversation_ids` digest/cursor, `config_sha256`), never raw transcripts or secrets; enforce `tenant_id` via verified actor/principal authority and `sioona_runtime` RLS (`CB-04`).
- **Leasing, Fencing & Retry Lifecycle:** States `queued` -> `leased` -> `succeeded` | `failed` | `cancelled` | `dead_lettered`; claim via `FOR UPDATE SKIP LOCKED`; track `attempt_count`, `lease_owner`, monotonic `lease_token`, `leased_at`, and `lease_expires_at` (90s default, 30s heartbeat); require matching `(job_id, lease_token)` on publication/completion so expired workers cannot overwrite reclaimed jobs; bound retries to `max_attempts = 3` with exponential backoff and preserve unpublished conversation IDs in `detection_resume`.
- **Metering, Budgets & Idempotent Publication:** Reserve `CB-07` budget allowance and write a `pending` row to `inference_attempts` (`CB-06`) under `principal:detection-worker` before every provider call; record `NULL` tokens with `usage_status = 'unknown'` when usage is missing; ensure signal/evidence publication (`CB-08`) is idempotent per `(tenant_id, job_id, conversation_id, content_sha256)`.
- **Processor Exclusion, Cutover & Rollback:** Gate via `SIOONA_DETECTION_EXECUTION=inline|worker` (default `inline`); prevent inline Next.js/`after()` LLM calls when in `worker` mode; support `SIOONA_WORKER_PAUSE=1` to drain leases cleanly and allow instant rollback to `inline`.
- **Preserved Semantics & Boundaries:** Keep gateway, prompts (`v3`), evidence offsets (`CB-08`), and human keep-set `SignalScore >= 80%` (`n >= 5`) unchanged; nothing auto-sends. Note that `CB-11` implementation remains gated on signed `CB-10` acceptance, and paid Render worker provisioning or live provider spend requires a separate operator go.

## D10 — Live/outbound integrations

Status: **approved for CB-16 local Intercom implementation**
Date: 2026-10-15
Approver: Sanket
Scope: The approved CB-16 plan covers provider signature/replay checks, server-bound installations, durable event/job acceptance, ordering/deletion, and explicit recovery, with local/disposable PostgreSQL verification. The 2026-10-16 follow-up authorizes verification, commit, push, and PR creation. Hosted migration, deployment, customer enablement, provider spend, and worker provisioning require separate approval. CB-03/CB-07 operator acceptance and signed CB-10 acceptance remain rollout gates. WhatsApp productionization and CB-17 are outside this change. Nothing auto-sends.

### D10 — CB-17 supervised external action approval

Status: **approved for local/sandbox implementation and verification only**
Date: 2026-10-16
Approver: Sanket
Scope: CB-17 implementation, disposable PostgreSQL 17 tests, local checks, commit and push of `cb/CB-17-supervised-external-action`. First action: `intercom_internal_note`, posting an internal operator note to an explicitly allowlisted sandbox Intercom conversation, never messaging the customer. `SIOONA_EXTERNAL_ACTIONS_ENABLED=0` is the default. Separate approval binds the exact proposal, payload SHA-256, target, verified actor, tenant, action version and expiry; Approve Draft never authorizes execution. A submitted timeout is `unknown` and cannot be blindly retried; explicit admin reconciliation is required. No hosted migration, deployment, production enablement, live customer target or provider credential provisioning is authorized. Existing hosted acceptance gates remain.

## D11 — Audit, retention, export, and deletion

Status: **approved**
Date: 2026-10-15
Approver: Sanket
Scope: **Local implementation and disposable PostgreSQL 17 verification authorized, with Sanket's explicit local-only exception to outstanding CB-03/CB-10 entry acceptance. Hosted database migrations, live customer deletion, background schedulers and D10 integrations remain prohibited.**

- **Audit:** Append-only `audit_events` with forced tenant RLS and restricted `sioona_runtime` privileges (INSERT/SELECT only; no direct UPDATE/DELETE/TRUNCATE and no tombstone-reconciliation exception). Bounded metadata only: id, tenant_id, actor_id, actor_role, resource_type, resource_id, resource_version, operation, result, reason_code, correlation_id, created_at. Never PII, transcripts, quotes, emails, or secrets. Retain audit and financial ledger summaries for 365 days; policy-aged expiry uses the separately restricted, tenant/age/hold-checked function rather than granting runtime DELETE.
- **Per-class retention:** Manual/on-demand sweeps only; no background auto-scheduler enabled by default. Redacted conversations/messages/uploads/predictions/evidence/detection runs: 180 days. Feedback/supervised decisions/outcomes/taxonomy/pilot settings: 365 days. Jobs/job-conversations/classification cache: 7–30 days. Generated export bundles: 24-hour TTL. Preserve shared users when removing one workspace membership unless zero workspace memberships remain. `pilot_requests` remain outside tenant deletion under operator ownership.
- **Legal hold:** Admin-only tenant/resource `legal_holds` with bounded reason_code block retention expiry and tenant deletion while allowing authorized admin read/export.
- **Tenant export:** Verified admin-only, with `X-Sioona-Actor` strictly enforced in all auth modes. Point-in-time JSON bundle with a versioned manifest and SHA-256 checksums covering only the requesting tenant's canonical data, excluding secrets/keys and cross-tenant users. Invalidate immediately upon tenant deletion.
- **Resumable deletion:** Extend `backend/app/services/tenant_data.py::wipe_tenant_data` into a checkpointed, resumable state machine: requested → confirmed → running → completed | blocked | failed. Require verified admin membership and exact tenant confirmation text. Fence active workers/jobs first; delete in FK-safe bounded steps; leave zero displayable `signal_evidence`; record a counts-only deletion tombstone/receipt for post-restore reconciliation.
- **Backups:** Backups expire on the hosting provider's natural retention window; immediate backup deletion is not promised.

