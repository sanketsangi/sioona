# Phase 2 go — 2026-10-13

**Decision:** Phase 2 is authorized. Continue **CB-10** (already started on `main` as `90625f2`). Do not start CB-11 until D9 is recorded. Do not start CB-13 promotion until an approved external corpus meets D5.

Reviewed against `docs/DEVELOPMENT_COOKBOOK.md` §9 on `main` `7ab84e5deb0c6e41008c7865528f8ec28564aac3`. GitHub Actions [run 38291090076](https://github.com/sanketsangi/sioona/actions/runs/38291090076) is success for Web, Backend, E2E, Eval gate, Gitleaks, and Marketing site.

This record supersedes “CB-10 has no go” and “CB-10 stays blocked” in earlier foundation notes. It does not waive the deferred operator items below, and it does not change the pilot claim: human keep-set SignalScore ≥80% with n ≥ 5.

## Phase 0 and Phase 1 — code accepted

| Card | Code on `main` | What “done” means here |
| --- | --- | --- |
| CB-00 | D0 applied 2026-10-07 | Baseline and governance diff. |
| CB-01 | Hashed `requirements.txt`, `backend/AGENTS.md`, CI `pip check` | Clean install from the lock. |
| CB-02 | E2E, Dependabot, Gitleaks; three latest `main` Tests runs are green, including E2E | Browser journey and scanning. Ruleset enforcement is deferred (below). |
| CB-03 | Memberships, actor assertion, isolation cases exempt only `GET /health` | Authorization code. Production stays `SIOONA_ACTOR_AUTH=off` until the staging window. |
| CB-04 | `024_tenant_rls`, local runtime-role proof | RLS in code and disposable Postgres. Hosted runtime URL is deferred. |
| CB-05 | `web/src/lib/ai/`; Groq host only in `ai/providers/groq.ts` plus tests | Gateway is the provider boundary. |
| CB-06 | `021_inference_attempts` and ledger routes | Per-attempt ledger. Cost stays `unknown` until a human enters official rates. |
| CB-07 | `023_inference_budgets`; pending row before dispatch | Attempt budgets and pause. Hosted timing drill is deferred. |
| CB-08 | `022_evidence_anchors`; operator confirmed the hosted 100-signal sample on 2026-10-08 | Reconstruction. Sample counts were not pasted into the task record. |
| CB-09 | Offline `eval:gate` in CI; synthetic D5 metrics pass | Engineering gate. External promotion is deferred to before CB-13. |

Day-30 engineering exits that are true in code: provider I/O goes through the gateway; a detection run can be explained from ledger rows; displayed quotes reconstruct from persisted spans; dependencies install from the hashed lock. Cross-tenant denial is tested and is not yet the production mode.

## Deferred — do not treat as Phase 2 blockers

These cannot be closed in an agent session. Each stays open until a human does the named work. None of them authorize production access, a ruleset write, a hosted migration, or a provider spend from this go.

| ID | Gap | Why it waits | Safe because | Closes before |
| --- | --- | --- | --- | --- |
| OP-1 | GitHub rulesets and classic branch protection still return HTTP 403 (GitHub Pro required on this private repo). Re-checked 2026-10-13. Do not make the repository public. | Account upgrade, then a human applies the proposal below. | CI already runs Web, Backend, Marketing site, E2E, Eval gate, and Gitleaks on pull requests. The missing control is enforcement against direct pushes. | CB-19 launch review |
| OP-2 | No isolated staging. CB-03 membership seed and 30-minute shadow window were not observed. Do not set `SIOONA_ACTOR_AUTH=enforce` in production. | Operator provisions an empty Neon project and an on-demand Render service, seeds synthetic memberships, and records the window. Procedure: `FOUNDATION_NEXT_ACTIONS.md` steps 3–5 and `STAGING_ACCEPTANCE.md`. | Pilot remains single-tenant behind the service token. CB-10 does not require enforce. | Production enforce, and any second production tenant |
| OP-3 | Hosted API still must be confirmed on `024_tenant_rls` after the managed-owner repair. `sioona_runtime` stays `NOLOGIN` until an operator sets a password out of band and points runtime `DATABASE_URL` at that role, with `MIGRATION_DATABASE_URL` left on the owner. | Operator deploy and URL switch. Agents do not run Alembic against hosted databases. | CB-04’s cookbook dependency on CB-10 is the multi-tenant rollout, not the single-tenant cutover. Owner connections bypass RLS until the switch. | Multi-tenant production |
| OP-4 | CB-07 schema `023` was present on hosted Neon (read-only, 2026-10-12). Pause propagation, exhaustion, and concurrent admission were not exercised on a host. | Operator drill on isolated staging, providers disabled, counts only. | Local Postgres already proved the race, IST midnight, and pause recheck. | Relying on the hosted kill switch during an incident |
| OP-5 | External holdout manifest is n=100. D5 needs at least 30 items in each of retention, upsell, lead, and none (minimum 120). | A separately authorized corpus. Do not invent a checksum or spend calls on the known-insufficient file. | Synthetic replay already gates CI. CB-13 is the promotion card. | CB-13 |

Accepted residuals, not new cards: assertion `jti` can be replayed until the 60-second expiry; `require_admin_role` stays until enforce; USD budgets stay off until official rates and an output ceiling are approved; other tenants stay `unresolved` until `backfill_signal_evidence.py --tenant … --apply`.

## Ruleset proposal (OP-1) — human applies, agent does not

After GitHub Pro is enabled for `sanketsangi/sioona`:

- Pull request required before merging to `main`.
- Required status checks: `Web`, `Backend`, `Marketing site`, `E2E`, `Eval gate`, `Gitleaks` (job names in `.github/workflows/test.yml`).
- Block force-push and block deletion of `main`.
- Record who may bypass, and keep bypass off for everyday merges.
- Read back with `gh api repos/sanketsangi/sioona/rulesets` and `gh api repos/sanketsangi/sioona/branches/main/protection`. HTTP 403 means OP-1 is still open.

## Phase 2 start line

CB-10 steps already on `main`: entity map in `docs/development/tasks/CB-10.md`, `SIOONA_STATE_MODE`, production refusal of `json-demo`, and live-tenant JSON write guards. Acceptance is still open: one write destination per entity, shadow-read comparison, reconciliation with zero unexplained loss, and a fresh production tenant reconstructing the dashboard with no runtime JSON file.

Current local `main` is `6ed8350`: conversations/messages slice 1 is committed in `3258c23`, with publication/shadow-report repairs in `6ed8350`. The cited CI run covers `7ab84e5` only, not these local commits or uncommitted dashboard shadow wiring. Resolve local review findings before proceeding to feedback and supervised decisions, the next D6 slice. Production Postgres mode remains off; hosted zero-loss observation requires separate authorization. D9, D10, and D11 are not approved; do not invent them. CB-12 waits on CB-10. CB-14 waits on CB-11 and CB-13. CB-15 can follow the ledger plus the canonical store. Phase 3 stays demand-led.


## Scoped publication continuation — 2026-10-13

The original approval record above is retained verbatim, including its historical commit and operator-state observations. Current scoped publication and exact-revision evidence are tracked in [CB-10](tasks/CB-10.md) and draft [PR #162](https://github.com/sanketsangi/sioona/pull/162). Publishing the repairs does not close hosted reconciliation/observation or approve D9/CB-11. Existing repository-configured preview status, including a staging-named project, is not proof of an isolated accepted API/database stack or an operator acceptance window.
