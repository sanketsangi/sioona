# Sioona Development Cookbook

**Version:** 2.0 (supersedes 1.0 of the same date)  
**Prepared:** 7 October 2026  
**Baseline commit:** `108f957c4ff9f8f4b3af1f78de5de0711b0b009d` (`main`)  
**Source:** *Sioona Engineering Evaluation and CTO Onboarding Plan* (CTO review of the 5 October code snapshot; see Appendix A)  
**Audience:** founder/CTO, contributors, Cursor agents (primary), Codex (optional reviewer)

**Strategy:** do not rewrite. Preserve the product, then make identity, lineage, AI spend, and production state authoritative before adding scope.

> **Build order (from the CTO review):** tenant security → model gateway → inference metering → evidence anchors → eval gate → canonical Postgres state → routing/batching → one live integration → one human-approved action integration.

This file is a plan, not an authorization. A task card describes what to build; it does not authorize production access, migrations against real databases, merges, deploys, outbound sends, or account changes. The human running the session grants those explicitly.

---

## 1. Start here

### 1.1 Your first Cursor session

1. Open a new Cursor chat in **Plan** mode.
2. Paste the implementation prompt from §15.1 with `CB-00`.
3. Approve the plan, switch to **Agent**, and let it produce `docs/development/baseline.md` plus the governance diff described in CB-00.
4. Record decision **D0** (§3.1). Until D0 is approved, only Phase 0 cards (CB-00, CB-01, CB-02) may run, because current repo rules forbid most of this roadmap.
5. Start each later card the same way, one card per branch: `cb/CB-05-model-gateway`.

### 1.2 How to read this file

| Section | Use it for |
|---|---|
| §2 Verified baseline | What the code does today, with file evidence. Trust the code over every other document. |
| §3 Decisions | Human decisions that block cards. Agents stop when a card's decision is unrecorded. |
| §4 Invariants | Rules every card must preserve. |
| §5 Working in Cursor | Per-card loop, task records, stop conditions, environment safety. |
| §6 Roadmap | Phases, dependency graph, parallel lanes, milestone exits. |
| §7–§10 Task cards | Executable recipes: files, steps, scaffolding, tests, acceptance. |
| §11–§14 | Commands, release gates, migration playbook, metrics/SQL, UI acceptance. |
| §15 Prompts | Copy-ready Cursor prompts. |
| §16 Traceability | Every CTO recommendation mapped to a card. |

Evidence labels used throughout:

- **Verified** — inspected at the baseline commit, with a file reference.
- **Reported** — stated by the CTO review, not re-verified.
- **Proposed** — a design or threshold introduced here; not shipped and not approved until recorded.

Scaffolding in task cards is **Proposed**. It shows shape and invariants; adapt names and types to the schema the agent finds at implementation time.

---

## 2. Verified baseline (commit `108f957`)

Not a security audit and not a test run. Hosted services were not inspected.

### 2.1 Architecture facts

| Area | Current behavior | Evidence | Consequence for the plan |
|---|---|---|---|
| Service auth | FastAPI trusts a shared bearer `SIOONA_SERVICE_TOKEN`, a caller-supplied `X-Tenant-Id`, and `X-Sioona-Role: admin` for wipe. Unset token outside production leaves the API open. | `backend/app/api/deps.py`, `backend/app/main.py` (router-level `require_service_token`) | CB-03 replaces header-asserted tenant/role with verified actor + DB membership. |
| Web auth | Signed httpOnly session cookie with roles `admin` / `reviewer` / `demo`. Pilot users come from env (`SIOONA_PILOT_USERS` JSON, or `SIOONA_ADMIN_*` / `SIOONA_REVIEWER_*`). No users/memberships tables. | `web/src/lib/auth-guard.ts`, `auth-users.ts`, `auth-token.ts`, `tenant-context.ts` | Revocation requires an env change and redeploy today. |
| Model calls | One direct `fetch` to Groq's OpenAI-compatible endpoint inside `requestGroqClassification`. Response `usage` is **never read**. | `web/src/lib/detect-llm.ts` (`GROQ_CHAT_URL`, ~L406–465) | No token or cost accounting exists. CB-05 and CB-06 start from zero. |
| Detect mode | With `DETECT_LLM=1` + `GROQ_API_KEY`, **primary mode is the default** (`DETECT_LLM_PRIMARY !== "0"`): Groq classifies every chat, and heuristics are the fallback. `DETECT_LLM_PRIMARY=0` restores miss-only pass 2. | `detect-llm.ts` `isLlmPrimaryEnabled`, `runHybridDetection` | Docs that say "miss-only, 8 calls" are stale (see 2.2). |
| Retry/fallback | Up to `min(4, DETECT_LLM_MAX_ATTEMPTS ?? 3)` attempts; 6 s timeout; concurrency 2; `Retry-After` honored up to 1.5 s on Vercel / 20 s locally; a daily-quota 429 switches the session to `openai/gpt-oss-20b` **without consuming an attempt**. Primary model `qwen/qwen3.8-27b`. Max calls per run: `DETECT_LLM_MAX_CALLS` (default 8), or 120 locally in primary mode. | `detect-llm.ts`, `detect-llm-config.ts` | One logical classification can bill several attempts across two models. The ledger must record each attempt. |
| Where detection runs | Inside Next.js request handlers and `after()` callbacks. | `web/src/app/api/ingest/route.ts`, `web/src/app/api/detect/route.ts`, `web/src/lib/live-ingest/accept.ts`, `web/src/lib/defer-ingest-sync.ts` | Long runs are bounded by serverless limits. CB-11 moves them to a worker. |
| Evidence | Signals carry evidence strings such as `quote: "…"`. At publication, the backend accepts a quote if its whitespace-normalized form is a substring of one customer turn, or if it ends in `…` with a prefix of at least 60 characters. The web side clips quotes to 140 UTF-16 units and folds punctuation when recovering quotes. No offsets or hashes are stored. INR amounts are grounded per `message_id`. | `backend/app/services/detection_runs.py` (`validate_customer_evidence`), `commercial_evidence.py`, `web/src/lib/clip-quote.ts` | CB-08 builds anchors on top of the existing validator rather than replacing it. |
| Message mutability | `messages` upserts on `(tenant_id, message_id)`. A re-upload replaces content for matched conversations. No version or hash column. Detection publication rejects runs whose conversation hash changed since classification. | `backend/app/models/message.py`, `detection_runs.py` (`conversation_content_hash`) | "Immutable source" is not true today. Decision D3 sets the policy. |
| Supervised actions | `supervised_action_decisions` has one row per `(tenant, conversation, action_type)`, with status `approved` / `edited` / `dismissed`. Nothing is sent. | `backend/app/models/supervised_action.py` | CB-17 extends this table; it does not add a second approval store. |
| Migrations | Linear chain `001`…`019`; head file `019_upload_recovery_index.py`. **Revision IDs do not always match file names** (`009_supervised_action_decisions.py` declares `009_supervised_actions`). | `backend/alembic/versions/` | Always take `down_revision` from `alembic heads`. |
| Hosted schema | PROJECT_STATE records hosted Neon last verified at `007`, with `008`–`011` "not confirmed applied". Later status unknown. | `.cursor/docs/PROJECT_STATE.md` §5 | **Release blocker:** confirm hosted `alembic current` before any new migration ships. |
| Backend tests | Default fixtures use in-memory SQLite. Only `tests/test_postgres_migrations.py` uses Postgres, and it refuses any database not named `sioona_migration_test`. | `backend/tests/conftest.py`, `test_postgres_migrations.py` | Tenant isolation, RLS, leases, and locks need Postgres-backed tests. |
| CI | Jobs **Web** (Node 22: `npm ci`, lint, `tsc --noEmit`, `npm test`, build), **Marketing site**, and **Backend** (Python 3.12, pytest, Postgres 17 migration checks). No E2E, dependency/secret scanning, or coverage gate. Branch protection unknown. | `.github/workflows/test.yml` | CB-02. |
| Python deps | Open-ended `>=` ranges, no lock. | `backend/requirements.txt` | CB-01. |
| Infra as code | `render.yaml` declares only the ingestion-recovery cron. The API service is dashboard-managed. | `render.yaml` | CB-19. |
| Live ingest | Behind `LIVE_INGEST=1`. Tenant comes from header `x-sioona-tenant-id` plus a shared-secret comparison, not provider signature verification. | `web/src/lib/live-ingest/flag.ts`, `web/src/app/api/ingest/live/*` | CB-16 audits and hardens this path. |
| Eval tooling | Promptfoo configs call Groq live (`groq:qwen/qwen3.8-27b`). Vitest includes `src/**/*.test.ts` and `eval/**/*.test.ts`. Held-out packs skip when absent (`describe.skipIf`). | `web/eval/promptfoo/`, `web/vitest.config.ts` | CB-09 adds an offline replay gate that cannot pass silently through a skip. |
| Web test isolation | `vitest.setup.ts` already sets `BACKEND_URL=http://127.0.0.1:9`. | `web/vitest.setup.ts` | A plain `npm test` is already isolated. |

### 2.2 Documentation and rule conflicts (resolve in CB-00)

| Conflict | Where | Resolution |
|---|---|---|
| Rule says Next.js 15; code uses `next ^16.3.0`, React `^19.2.8`. | `.cursor/rules/sioona-architecture.mdc` | Factual fix; no D0 needed. |
| "Groq on zero-signal misses, at most 8 calls" vs primary-by-default code. | `.cursor/rules/sioona-domain.mdc`, PROJECT_STATE §3 | Factual fix to describe both modes and their env flags. |
| "Do not start Auth0 / real tenant isolation", "classify-on-FastAPI", "429 retries", "live webhooks". | `.cursor/rules/architect.mdc`, PROJECT_STATE §3 and §7 | **Governance.** Blocks CB-03, CB-04, CB-11, CB-16. Changes only with D0. |
| "Do not implement full Precision/Recall pipelines unless explicitly asked." | `.cursor/rules/evaluation-metrics.mdc` | Blocks CB-09. D0 counts as the explicit ask; keep the rule that labeled P/R is never the pilot claim. |
| An earlier review tracker lists pending items (tenant isolation verification, durable jobs, legacy provenance migration). | `docs/CODEBASE_REVIEW_IMPLEMENTATION.md` | Map each pending item to a card in the baseline record. Keep a single tracker. |
| Duplicate state narratives. | `docs/PROJECT_STATE.md`, `docs/architecture.md` point to `.cursor/docs/` | Keep `.cursor/docs/` canonical. |

---

## 3. Decisions register

Agents must not invent these. Each card lists the decisions it waits on. Record approvals in `docs/development/decisions.md` with date, approver, and choice.

### 3.1 Governance gate D0

**D0: Authorize the foundations heading.** Approving it means:

- Freezing net-new feature work for one foundation sprint (CTO recommendation), while the pilot loop keeps running.
- Updating PROJECT_STATE §0 heading and §7 "do not start" to allow the approved cards.
- Updating `architect.mdc` (the Auth0/tenant-isolation line) and `evaluation-metrics.mdc` (the P/R line).
- Keeping the customer claim unchanged: human keep-set SignalScore ≥80% with n ≥ 5 on the Eval week window.

CB-00 drafts the exact diff. A human applies or approves it.

### 3.2 Technical decisions

| ID | Decision | Recommended default (Proposed) | Blocks |
|---|---|---|---|
| D1 | Identity approach | **Staged.** (a) Postgres `users`/`memberships` as role authority, with short-lived signed actor assertions from the Next server to FastAPI and passwords still verified in web. (b) Adopt a managed IdP later behind the same membership model when SSO or customers need it. | CB-03 |
| D2 | Ledger write mode while inference runs in web | Buffered per-run flush in `finally`, idempotent on `attempt_id`, plus a ledger preflight: no ledger means heuristics only, no LLM. Record the crash window as a known gap closed by CB-11, where the worker writes `pending` before calling the provider. | CB-06 |
| D3 | Evidence offsets and message mutability | Unicode **code-point** offsets, half-open `[start, end)`, over exact persisted `messages.content`. Add `messages.content_sha256`. A content change makes anchors **stale**: show "source changed" and re-detect, never re-anchor silently. | CB-08 |
| D4 | Budgets and kill switch | Per-tenant daily USD cap, per-upload attempt cap, IST day boundary (pilot market), named kill-switch owner, propagation bound ≤ 60 s. | CB-07 |
| D5 | Eval corpus and thresholds | Synthetic corpus in repo. Partner-derived holdout outside the repo with a checksum in the repo. Thresholds from CB-09. | CB-09, CB-13 |
| D6 | Postgres cutover order | Conversations/messages → feedback/decisions → pilot settings → taxonomy overrides → remaining JSON. | CB-10 |
| D7 | Python lock tool | `uv pip compile --universal --generate-hashes` writing to `requirements.txt` from `requirements.in`, so CI and Render commands stay `pip install -r requirements.txt`. pip-tools is acceptable. | CB-01 |
| D8 | RLS adopt or defer | Adopt on high-value tables after CB-03, using a runtime role distinct from the migration role. | CB-04 |
| D9 | Job runtime | Postgres `jobs` table with `FOR UPDATE SKIP LOCKED`, and a Render background worker from the same backend code. No new queue infrastructure. | CB-11 |
| D10 | First live source and first external action | Demand-led only (likely Intercom; CRM note/task or email draft). | CB-16, CB-17 |
| D11 | Retention, export, deletion, backups | Per data class; documented backup expiry rather than an "immediate delete" promise. | CB-18 |

---

## 4. Product contract and invariants

Sioona overlays existing customer conversations to surface revenue signals: `retention` (primary wedge), `upsell`, and `lead`. The market is India mid-market broking/fintech support. It is not a chatbot replacement.

```text
conversation → normalized messages → versioned detection → grounded evidence
→ human review → supervised draft decision → (separately gated) external action
→ recorded outcome → quality + cost feedback
```

### 4.1 Pilot semantics that must not change as a side effect

- The pilot loop is: upload an anonymized export → Insights / Shadow Mode → Correct / Incorrect / Partially Correct → Mark Acted (display-only) → outcome → Eval week-window keep-set.
- The go gate is keep-set SignalScore ≥80% with n ≥ 5, computed as correct / reviewed (partial and incorrect count in the denominator only). It is a small-sample pilot criterion, not model accuracy or an SLA.
- **Approve Draft records a decision and sends nothing. Mark Acted is display-only.**
- No foundation card changes taxonomy, prompts, models, customer-facing claims, or live/outbound behavior unless that change is the card's stated goal.

### 4.2 Engineering invariants

**Tenancy**
- Authenticate the actor, then resolve membership and role server-side. Tenant headers, bodies, route IDs, and client roles are untrusted selectors.
- Scope every query, mutation, cache key, job, evidence row, ledger row, and credential to a tenant. External IDs are not globally unique.
- Background work runs as explicit service principals with an allowed-operation list.
- Cross-tenant access is release-blocking.

**Data and evidence**
- Evidence derives from persisted, redacted text and reconstructs exactly from `(message_id, start, end, text_sha256)`.
- An invalid or stale anchor quarantines the evidence with a reason. The UI shows a recoverable state, never fabricated proof.
- Reprocessing versions derived outputs. Historical feedback and outcomes stay on superseded predictions (this is already how `reconcile_detection` behaves).

**AI and economics**
- Every billable provider attempt produces a ledger row, including retries, fallback-model switches, timeouts, and malformed responses.
- Unknown usage is `NULL` plus `usage_status='unknown'`, never zero.
- Extracting a gateway preserves behavior. Model, prompt, or route changes need an eval artifact (CB-09).
- Retries, concurrency, and spend are bounded, and a kill switch exists.
- Transcripts are untrusted input. They cannot grant tools, change instructions, or authorize actions.
- Raw transcripts never go to logs, the ledger, or analytics.

**Change safety**
- Draft approval, feedback, Acted, external execution, and business outcome remain distinct states.
- No production credentials in agent environments. Protect unrelated working-tree edits; no hard resets or broad staging.
- Migrations are additive first and are rehearsed on Postgres. A code rollback is not a database restore.

---

## 5. Working in Cursor

### 5.1 Roles

| Role | Who | Responsibility |
|---|---|---|
| Implementer | Cursor Agent (one per card branch) | Plan → implement → verify → task record |
| Reviewer | A **different** model in a fresh Cursor chat, Bugbot on the PR if enabled, or Codex | Read-only adversarial review of the exact diff |
| Approver | Human (founder/CTO) | Approves plans for P0 cards, decisions, merges, migrations, and releases |

For auth, tenancy, billing/ledger, migrations, deletion, and external actions, the order is: implementer → independent review → CI → human review → merge. No agent is both sole implementer and approver.

### 5.2 Per-card loop

1. **Plan mode.** Paste §15.1. The agent reports baseline (branch, SHA, status, `alembic heads`), checks the card's decisions, reads the listed files, and proposes commit-sized steps.
2. **Human approves the plan.** For P0 cards, approve the rollout flag and test list explicitly.
3. **Agent mode.** Implement one step at a time, running the card's targeted checks after each step.
4. **Full checks** (§11.2). Record exact counts and every skip in the task record.
5. **Review.** Open a fresh chat on a different model and paste §15.2. Fix substantiated findings and re-run affected checks. Material changes get re-reviewed.
6. **PR.** CI must be green. Merge, migrate, and deploy only with human authorization, then record release evidence.

Branch names: `cb/CB-XX-short-slug`. Parallel cards only on disjoint files, in separate worktrees, with human permission.

### 5.3 Stop conditions

Agents stop and ask before any of the following:

- Production or hosted access of any kind: Neon, Render, Vercel, provider dashboards.
- Running Alembic or SQL against a database other than a disposable test database.
- A paid or networked model call, unless the card is a benchmark card and a spend cap is approved.
- Changing prompts, models, taxonomy, SignalScore math, or pilot UI semantics.
- Destructive schema or data operations.
- Editing files outside the card's **Files** list, beyond small mechanical fallout (imports, types).
- Finding that the card's baseline disagrees with code in a way that changes the design.
- Pre-existing test failures unrelated to the card (report them; don't fix silently).

### 5.4 Task record template

Create `docs/development/tasks/CB-XX.md` when a card starts. The folder does not exist yet; CB-00 creates it.

```markdown
# CB-XX — Title
Status: planned | in-progress | review | blocked | done
Implementer (tool/model): …    Reviewer (tool/model): …
Branch: cb/CB-XX-…    Base SHA: …    Head SHA: …
Decisions relied on: D…, recorded in docs/development/decisions.md on …
Scope (files): …
Preserved invariants: …
Steps completed: 1 … / 2 … (commit SHAs)
Checks (command → result, date): …
Skipped checks and why: …
Migration evidence (PG upgrade from prior head, backfill, validation): …
Review findings (severity → resolution): …
Remaining risks / follow-ups: …
Authorization granted / not granted: …
Next action: …
```

### 5.5 Definition of done (every card)

- Acceptance boxes ticked, each with evidence (test name, command output, or file:line).
- Adverse cases from the card are tested.
- Reviewer saw the exact head SHA. CI is green, and no critical test skips silently.
- No secrets, customer exports, or `web/data/store*.json` staged.
- Migration and compatibility plan executed on Postgres when the card touches schema.
- New failure modes have logs or metrics and a recovery path.
- Task record complete. `.cursor/docs/PROJECT_STATE.md` / `architecture.md` updated when heading, topology, or source of truth changed.

### 5.6 Agent environment safety (from the CTO review)

**Allowed:** repo source, npm/pip registries, a disposable test database, synthetic fixtures, GitHub PR access, documented public APIs.

**Never provided:** production database URLs, customer uploads, production LLM billing keys, CRM or email-send credentials, Vercel/Render/Neon org admin tokens, payment credentials.

For Cursor cloud/background agents: limit the GitHub app to this repository, enable Privacy Mode, use an egress allowlist where available, provide dev/test secrets only, and set a spend limit. Agents prove code works; they don't operate the company.

### 5.7 How this file interacts with existing rules

- Root `AGENTS.md` (UI/a11y) and nested `web/AGENTS.md` / `site/AGENTS.md` keep applying. CB-01 adds `backend/AGENTS.md` and a short cross-cutting invariants section in root `AGENTS.md`.
- `architect.mdc` and `grok-first-pass.mdc` serve short product tasks and ≤6-line sketches. For CB cards, use §15 prompts; they carry the scope and stop conditions that short sketches omit.
- `.cursor/docs/PROJECT_STATE.md` stays the living heading. This cookbook stays the roadmap. Don't copy status into both.

---

## 6. Roadmap

### 6.1 Phases (an order of delivery, not a schedule)

| Phase | Target | Cards | Theme |
|---|---|---|---|
| 0 | Days 1–5 | CB-00, CB-01, CB-02 | Executable baseline, governance, CI protection |
| 1 | ≈ Days 6–30 | CB-03 to CB-09 | Trustworthy foundations: auth, gateway, ledger, spend, evidence, eval gate |
| 2 | ≈ Days 31–60 | CB-10 to CB-15 | Canonical Postgres, durable jobs, formats, routing, batch, dashboard |
| 3 | ≈ Days 61–90 | CB-16 to CB-19 | One live source, one supervised action, lifecycle, infrastructure |

Estimates in cards come from the CTO review and assume one strong full-stack engineer working with agents.

### 6.2 Dependency graph

```mermaid
flowchart LR
    CB00[CB-00 Baseline + D0] --> CB01[CB-01 Locks + instructions]
    CB01 --> CB02[CB-02 PR protection + E2E]
    CB00 --> CB05[CB-05 Gateway]
    CB05 --> CB06[CB-06 Ledger]
    CB06 --> CB07[CB-07 Spend controls]
    CB00 --> CB03[CB-03 Authorization]
    CB03 --> CB04[CB-04 RLS]
    CB00 --> CB08[CB-08 Evidence anchors]
    CB05 --> CB09[CB-09 Eval gate]
    CB06 --> CB09
    CB08 --> CB09
    CB03 --> CB10[CB-10 Canonical Postgres]
    CB08 --> CB10
    CB07 --> CB11[CB-11 Durable jobs + worker]
    CB10 --> CB11
    CB10 --> CB12[CB-12 XLSX + email]
    CB09 --> CB13[CB-13 Routing benchmark]
    CB11 --> CB14[CB-14 Batch + caching]
    CB13 --> CB14
    CB06 --> CB15[CB-15 Economics dashboard]
    CB10 --> CB15
    CB03 --> CB18[CB-18 Audit + lifecycle]
    CB10 --> CB18
    CB11 --> CB16[CB-16 Live source]
    CB18 --> CB17[CB-17 Supervised action]
    CB11 --> CB17
    CB16 --> CB19[CB-19 Infra + launch]
    CB17 --> CB19
```

The CTO priority order puts tenant security first. Dependencies here let the gateway/ledger lane (CB-05 to CB-07) and the evidence lane (CB-08) proceed while the identity decision D1 is pending. Ledger and evidence rows use the existing tenant context and get the stronger actor binding when CB-03 lands.

### 6.3 Parallel lanes (separate worktrees, disjoint files)

| Lane | Cards | Primary files |
|---|---|---|
| A — Platform | CB-01 → CB-02 | `backend/requirements*`, `.github/`, `AGENTS.md`, `web/e2e/` |
| B — AI economics | CB-05 → CB-06 → CB-07 | `web/src/lib/ai/`, `web/src/lib/detect-llm.ts`, ledger backend files |
| C — Trust | CB-03 → CB-04; CB-08 | `backend/app/api/`, auth libs, evidence backend files |

Lanes B and C both touch `backend/app/models/__init__.py` and the migration chain. Serialize migration creation: re-run `alembic heads` after rebasing, and never leave two heads.

### 6.4 Milestone exits (CTO acceptance, restated)

**Day ≈30: "trustworthy to operate"**
- [ ] Automated cross-tenant requests fail, and tenant ID alone is insufficient authorization (CB-03).
- [ ] `detect-llm.ts` is no longer the product's only provider boundary (CB-05).
- [ ] For any detection run: which models ran, how many calls, tokens, duration, retries, and cost (CB-06).
- [ ] A 100-signal sample reconstructs every displayed quote from persisted source (CB-08).
- [ ] A clean environment builds and tests with deterministic dependencies, and no agent holds production credentials (CB-01, §5.6).

**Day ≈60: "economically scalable intelligence"**
- [ ] Every model/prompt candidate yields comparable precision, recall, evidence validity, latency, and cost (CB-09).
- [ ] The production route has a benchmark artifact with quality and cost deltas (CB-13).
- [ ] 10K historical conversations process without request timeouts or duplicate signals after retry (CB-11, CB-14).
- [ ] A new production tenant's dashboard reconstructs from Postgres with no runtime JSON (CB-10).
- [ ] XLSX and email exports flow through the same normalized schema (CB-12).
- [ ] "What do 10K / 50K / 100K conversations cost, at what quality?" is answered from measured data (CB-15).

**Day ≈90: "pilot-production ready"**
- [ ] Live-source replay is idempotent, and failures land in a recoverable queue (CB-16).
- [ ] Any external write follows proposed → approved → attempted → audited result (CB-17).
- [ ] One workspace exports or deletes without affecting another, with an audit trail (CB-18).
- [ ] The internal dashboard computes funnel, quality, spend, latency, and margin. Showing illustrative numbers is not the bar; the capability to compute them is (CB-15, CB-19).

---

## 7. Phase 0: executable baseline

### CB-00 — Baseline, drift fixes, and governance diff

**Priority** P0 · **Depends on** nothing · **Decisions** none to start; produces D0 · **Size** 0.5–1 day · **Writes** docs only

**Goal.** One evidence-backed record of what exists, plus the exact rule/state edits needed to authorize the roadmap.

**Files.** New: `docs/development/baseline.md`, `docs/development/decisions.md`, `docs/development/tasks/CB-00.md`. Edit (factual drift only): `.cursor/rules/sioona-architecture.mdc`, `.cursor/rules/sioona-domain.mdc`, PROJECT_STATE §3. Draft only, applied after D0: PROJECT_STATE §0/§7, `architect.mdc`, `evaluation-metrics.mdc`.

**Steps.**
1. Record `git rev-parse HEAD`, `git status --short`, and the toolchain versions (`node -v`, `python3 --version`).
2. Run the baseline checks from §11.2 and record counts and skips. If Docker is available, run the Postgres migration test with the disposable container from §11.2.
3. Inventory the system with these commands:
   ```bash
   rg -n "@router\.(get|post|put|patch|delete)\(" backend/app/api/routes
   rg -n "__tablename__" backend/app/models
   rg -o --no-filename "process\.env\.[A-Z0-9_]+" web/src | sort -u
   (cd backend && alembic heads && alembic history | head -25)
   ```
4. Write `baseline.md` with:
   - a route table (method, path, tenant source: path or header, auth dependencies);
   - a table list;
   - an env-flag list with purpose (names only, never values);
   - an entity-authority table (JSON vs Neon per entity, from `.cursor/docs/architecture.md` plus code);
   - the effective detect mode per environment, marked "unknown" where hosted env was not inspected;
   - each `docs/CODEBASE_REVIEW_IMPLEMENTATION.md` pending item mapped to a CB card.
5. Fix factual drift: Next.js 16 / React 19.2 in `sioona-architecture.mdc`; both detect modes in `sioona-domain.mdc` and PROJECT_STATE §3.
6. Write the human-run verification step for hosted schema: "run `alembic current` against hosted Neon with read-only access; record the revision." Agents never run it.
7. Draft the D0 governance diff in `decisions.md`, using exact before/after lines for each file in §2.2.

**Acceptance.**
- [ ] `baseline.md` cites file paths for every claim and lists unknowns explicitly.
- [ ] No historical test count is presented as current unless re-run in this session.
- [ ] Factual drift fixed, with no behavior change in the diff.
- [ ] D0 diff ready for human approval. Hosted-schema verification assigned to a human.

**Rollback.** Revert the docs commit.

---

### CB-01 — Reproducible installs and shared engineering instructions

**Priority** P0 · **Depends on** CB-00 · **Decisions** D7 · **Size** 0.5–1 day (locks) + 0.5 day (instructions)

**Goal.** A clean machine reproduces backend dependencies exactly, and every agent reads the same backend and cross-cutting invariants.

**Files.** New: `backend/requirements.in`, `backend/AGENTS.md`, `backend/.python-version` (`3.12`), `web/.nvmrc` (`22`). Modify: `backend/requirements.txt` (becomes the compiled lock), root `AGENTS.md` (additive section at the top), `backend/README.md` (install/lock instructions), `.github/workflows/test.yml` (add `pip check`).

**Steps.**
1. Lock Python dependencies:
   ```bash
   cd backend
   git mv requirements.txt requirements.in
   uv pip compile requirements.in --universal --python-version 3.12 --generate-hashes -o requirements.txt
   python3.12 -m venv /tmp/sioona-lock && /tmp/sioona-lock/bin/pip install -r requirements.txt
   /tmp/sioona-lock/bin/pip check && /tmp/sioona-lock/bin/python -m pytest -q
   ```
   CI and Render keep `pip install -r requirements.txt` unchanged; pip enforces hashes automatically.
2. Add a `pip check` step after the backend install in CI.
3. Create `backend/AGENTS.md` from the scaffold below.
4. Add the cross-cutting section to the top of root `AGENTS.md`. Leave the existing UI rules untouched.
5. Document env variables by name and purpose in `backend/README.md`, never values.

**Scaffold — `backend/AGENTS.md`.**
```markdown
# Backend engineering contract (FastAPI + Postgres)

## Tenancy
- Every tenant-owned table has `tenant_id`; every query filters on it.
- Tenant identity comes from the verified actor or service principal, never from a body field or an unverified header.
- Every tenant route has a case in `tests/test_tenant_isolation.py`. Cross-tenant access is release-blocking.

## Data
- Message text changes only with a new `content_sha256`; evidence must reconstruct from persisted text.
- Never hard-delete feedback, supervised decisions, ledger, or audit rows outside the approved tenant-deletion path.
- Never log message content, transcripts, or secrets.

## AI
- Every provider attempt has an `inference_attempts` row. Unknown usage stays NULL with `usage_status='unknown'`.
- No model, prompt, or route change without an eval comparison artifact.

## Migrations
- Set `down_revision` from `alembic heads`. Revision IDs do not always match file names.
- Expand → backfill → validate → contract. Destructive steps need human review.
- Extend `tests/test_postgres_migrations.py` for new tables and constraints. SQLite tests do not prove Postgres behavior.
- Never run Alembic or SQL against a non-test database from an agent session.

## Checks
- `python -m pytest`
- `PG_TEST_DATABASE_URL=postgresql+psycopg://…/sioona_migration_test python -m pytest tests/test_postgres_migrations.py -q`
- Dependencies: edit `requirements.in`, then recompile `requirements.txt` with hashes. Never hand-edit the lock.
```

**Scaffold — root `AGENTS.md` addition.**
```markdown
## Engineering invariants (all packages)

- Humans approve consequential actions. Nothing auto-sends customer communication or writes external systems without an explicit approved action.
- Tenant identity is resolved server-side; never trust a tenant/role value because it arrived in a request.
- Evidence shown to operators must reconstruct from persisted source text.
- Every model call is metered; model/prompt changes need an eval comparison.
- Never log raw transcripts; never commit secrets, customer exports, or `web/data/store*.json`.
- Package rules: `web/AGENTS.md`, `site/AGENTS.md`, `backend/AGENTS.md`. Roadmap: `docs/DEVELOPMENT_COOKBOOK.md`.
```

**Acceptance.**
- [ ] Fresh Python 3.12 venv installs from the lock with hashes, and `pip check` and pytest pass.
- [ ] CI backend job is green with the locked file.
- [ ] Root UI rules unchanged; new sections are additive.
- [ ] No secret values anywhere in docs.

**Rollback.** `git revert`. The compiled file can be regenerated from `requirements.in`.

---

### CB-02 — PR protection, E2E, and dependency/secret scanning

**Priority** P0 · **Depends on** CB-01 · **Decisions** none · **Size** 0.5 day (protection) + 2–3 days (E2E)

**Goal.** `main` changes only through PRs with required checks, and one browser test proves upload → review → persisted decision with nothing sent.

**Files.** New: `web/playwright.config.ts`, `web/e2e/upload-review.spec.ts`, `.github/dependabot.yml`, an `e2e` job in `.github/workflows/test.yml`. Modify: `web/package.json` (dev dependency `@playwright/test`, script `"e2e": "playwright test"`).

**Steps.**
1. Read the current protection settings (read-only) and record the result:
   ```bash
   gh api repos/sanketsangi/sioona/rulesets
   gh api repos/sanketsangi/sioona/branches/main/protection   # 404 means no classic protection
   ```
2. Write a ruleset proposal: PR required; required checks `Web`, `Backend`, `Marketing site` (these are the job names in `test.yml`), plus `E2E` once stable; block force-push and deletion; record admin bypass paths. **A human applies it.** If settings access is missing, record that as a release blocker, not as done.
3. Write the E2E test, deterministic and free:
   - Run the backend against the CI Postgres service after `alembic upgrade head`, and the web app with `DETECT_LLM` unset (heuristics only, no provider calls).
   - Upload `web/data/samples/pilot/independent-rehearsal/rehearsal_week_1.csv` through the Upload view (find the route in `web/src/lib/views.ts`).
   - Assert pending signals appear with visible evidence, record **Correct** on one, reload, and assert it persisted.
   - Approve a draft, reload, and assert the decision persisted. Assert no outbound request: route-intercept anything that is not localhost.
4. Add `.github/dependabot.yml` (scaffold below). Enable GitHub secret scanning if the plan allows it; otherwise add a gitleaks job. Report `npm audit --audit-level=high` as informational first.
5. Optional: record current coverage as a baseline, without a threshold gate yet.

**Scaffold — `.github/dependabot.yml`.**
```yaml
version: 2
updates:
  - { package-ecosystem: npm, directory: /web, schedule: { interval: weekly } }
  - { package-ecosystem: npm, directory: /site, schedule: { interval: weekly } }
  - { package-ecosystem: pip, directory: /backend, schedule: { interval: weekly } }
  - { package-ecosystem: github-actions, directory: /, schedule: { interval: weekly } }
```

**Acceptance.**
- [ ] The E2E test passes in CI three runs in a row (flake check) with zero provider calls.
- [ ] The ruleset proposal is recorded. Applied settings are verified via `gh api`, or the gap is recorded as a blocker.
- [ ] Scanning is configured. Confirmed findings have an owner and a disposition.

---

## 8. Phase 1: trustworthy foundations (≈ days 6–30)

### CB-03 — Authoritative workspace authorization

**Priority** P0 · **Depends on** CB-00 (D0) · **Decisions** D1 · **Size** 3–5 days · **Human review required**

**Goal.** FastAPI derives tenant and role from a verified actor plus DB membership. Forged headers, expired assertions, and revoked members fail.

**Files.** Modify: `backend/app/api/deps.py`, every module in `backend/app/api/routes/`, `backend/app/config.py` (add `sioona_actor_key`, `sioona_actor_auth_mode`), `web/src/lib/backend-client.ts` (headers currently built ~L170–200; the admin role header ~L772), `web/src/lib/auth-guard.ts`. New: `backend/app/models/{workspace,user,membership}.py`, a migration (`down_revision` from `alembic heads`), `backend/app/api/actor.py`, `backend/scripts/seed_memberships.py`, `web/src/lib/actor-assertion.ts`, `backend/tests/test_tenant_isolation.py`, and Postgres cases in `test_postgres_migrations.py`.

**Steps.**
1. Write an ADR for D1 in `decisions.md`: claims, TTL, key rotation, and the demo principal.
2. Migration: `workspaces(tenant_id PK, name, created_at)`, `users(id, email UNIQUE, created_at)`, and `memberships(tenant_id FK, user_id FK, role CHECK IN ('admin','reviewer','demo'), created_at, revoked_at NULL, UNIQUE(tenant_id, user_id))`.
3. Seed script: read the `SIOONA_PILOT_USERS` shape from stdin and upsert users and memberships. It is idempotent and never prints passwords. A human runs it against hosted.
4. Web: on every backend call, mint a 60 s HS256 assertion (`iss=sioona-web`, `aud=sioona-api`, `sub`, `tid`, `iat`, `exp`, `jti`) and send it as `X-Sioona-Actor`. Stop sending `X-Sioona-Role`. Keep the service token.
5. Backend: add a `require_actor(permission)` dependency. It verifies the signature, issuer, audience, and expiry, requires path `tenant_id == claims.tid`, loads an unrevoked membership, and checks the permission map. Routes that take tenant from the header only (for example `POST` in `supervised_actions.py`) move to `/v1/tenants/{tenant_id}/…`. During the shadow phase, keep compatibility aliases.
6. Rollout flag `SIOONA_ACTOR_AUTH=off|shadow|enforce`. `shadow` logs mismatches (tenant, route, reason; no PII) without blocking. Production moves to `enforce` only after a clean shadow window.
7. Service principals: the recovery cron and live-ingest webhooks each get a named principal with an allowed-operation list, not an admin role.
8. Delete `require_admin_role` once `enforce` ships.

**Scaffold — web signer.**
```ts
// web/src/lib/actor-assertion.ts — server-only
import { createHmac, randomUUID } from "node:crypto";

const b64 = (value: string) => Buffer.from(value).toString("base64url");

export function signActorAssertion(sub: string, tid: string, key: string, ttlSeconds = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({ iss: "sioona-web", aud: "sioona-api", sub, tid, iat: now, exp: now + ttlSeconds, jti: randomUUID() }),
  );
  const signature = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
```

**Scaffold — FastAPI dependency** (adds `pyjwt` to `requirements.in`).
```python
# backend/app/api/actor.py
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.membership import Membership

PERMISSIONS = {
    "read": {"admin", "reviewer", "demo"},
    "review": {"admin", "reviewer"},
    "admin": {"admin"},
}


@dataclass(frozen=True)
class Actor:
    user_id: str
    tenant_id: str
    role: str


def require_actor(permission: str):
    allowed = PERMISSIONS[permission]

    def dependency(
        tenant_id: str,  # bound from the route path /v1/tenants/{tenant_id}/…
        assertion: Annotated[str | None, Header(alias="X-Sioona-Actor")] = None,
        db: Session = Depends(get_db),
    ) -> Actor:
        if not assertion:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "actor_required")
        try:
            claims = jwt.decode(
                assertion,
                get_settings().sioona_actor_key,
                algorithms=["HS256"],
                audience="sioona-api",
                issuer="sioona-web",
                options={"require": ["exp", "iat", "sub", "tid", "jti"]},
            )
        except jwt.PyJWTError:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_actor")
        if claims["tid"] != tenant_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        membership = db.scalar(
            select(Membership).where(
                Membership.tenant_id == tenant_id,
                Membership.user_id == claims["sub"],
                Membership.revoked_at.is_(None),
            )
        )
        if membership is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        if membership.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
        return Actor(claims["sub"], tenant_id, membership.role)

    return dependency
```

**Scaffold — route coverage test.** This test fails whenever a new route lacks an isolation case.
```python
# backend/tests/test_tenant_isolation.py
from fastapi.routing import APIRoute

from app.main import app

EXEMPT = {("GET", "/health")}
# (method, path) -> callable(client, seed) that performs tenant B's request against tenant A's data
ISOLATION_CASES: dict[tuple[str, str], object] = {}


def all_routes():
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                yield method, route.path


def test_every_route_has_an_isolation_case():
    missing = sorted(r for r in all_routes() if r not in EXEMPT and r not in ISOLATION_CASES)
    assert not missing, f"Add tenant-isolation cases for: {missing}"
```

**Tests.** For each case, seed tenants A and B with **identical external IDs**. As B, read, list, page, search, and mutate A's resources and expect 404 or 403 with no A data in the body. Also cover: forged `X-Tenant-Id`, missing / expired / wrong-audience / wrong-issuer assertion, revoked membership, demo principal attempting a mutation, and production with an empty key failing closed. Repeat a representative subset on Postgres.

**Acceptance.**
- [ ] The coverage test passes with zero exemptions beyond `/health`.
- [ ] All adverse cases pass on SQLite, and a subset passes on Postgres.
- [ ] Revoking a membership blocks the next request without a redeploy.
- [ ] Shadow logs show zero unexplained mismatches before `enforce`.
- [ ] Expired web sessions get a recoverable sign-in path in the UI.
- [ ] Independent review and human review complete.

**Rollback.** Set `SIOONA_ACTOR_AUTH=shadow`. Membership tables are additive and stay.

---

### CB-04 — Database tenant defense in depth (RLS)

**Priority** P1 (release-critical before broader multi-tenant production) · **Depends on** CB-03 · **Decisions** D8 · **Human review required**

**Goal.** A query that forgets its tenant filter still cannot cross tenants under the runtime role.

**Steps.**
1. Create a separate `MIGRATION_DATABASE_URL` (owner role) and `DATABASE_URL` (runtime role: not the table owner, no `BYPASSRLS`). Render currently runs `alembic upgrade head` with one URL, so this needs a human change in the Render config.
2. On every API and worker transaction, set the tenant context: `SELECT set_config('app.tenant_id', :tenant_id, true)`.
3. Enable policies on the high-value tables: `messages`, `conversations`, `signal_predictions`, `signal_feedback`, `supervised_action_decisions`, `detection_runs`, `inference_attempts`, and evidence.
4. Roll out one table at a time behind a migration, after Postgres tests pass.

**Scaffold.**
```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
-- Unset context → current_setting(..., true) is NULL → zero rows (fails closed).
```

**Acceptance.**
- [ ] On Postgres as the runtime role, an unscoped `SELECT` returns only the current tenant's rows.
- [ ] Missing context returns zero rows, and an insert for another tenant fails.
- [ ] Pooled connections never leak context between requests (test two sequential transactions on one connection).
- [ ] If RLS is deferred, the decision is recorded with compensating controls and residual risk.

**Rollback.** Drop policies per table via a reviewed migration. Never use an undocumented global disable.

---

### CB-05 — Provider-neutral gateway (behavior-preserving)

**Priority** P0 · **Depends on** CB-00 · **Decisions** none · **Size** 2–4 days

**Goal.** All provider I/O goes through `web/src/lib/ai/`, with identical outputs. This card makes no model, prompt, or routing change.

**Files.** New (all under `web/src/lib/ai/`): `types.ts`, `usage.ts`, `providers/groq.ts`, `attempts.ts`, `boundary.test.ts`, `usage.test.ts`, `providers/groq.test.ts`. Modify: `web/src/lib/detect-llm.ts` (move the transport out of `requestGroqClassification`; keep every exported name and signature).

**Steps.**
1. **Transport only.** Move the `fetch`, headers, timeout, HTTP error mapping (`groqFailureKind`, `isGroqDailyQuota`, `retryAfterMs`), and response JSON read into `web/src/lib/ai/providers/groq.ts`. `detect-llm.ts` keeps prompt building, parsing, the retry loop, pacing, and fallback.
2. **Parity proof.** The existing `detect-llm.test.ts`, `detect-llm-primary.test.ts`, `detect-llm-query.test.ts` (in `web/src/lib/`), plus `web/src/app/api/detect/route.test.ts` and `web/src/app/api/ingest/route.test.ts`, must pass **unmodified**. The adapter keeps using global `fetch`, so existing fetch stubs still apply.
3. **Usage parsing.** The adapter returns `InferenceUsage` parsed from the response `usage`. Verify field names against current Groq documentation at implementation time.
4. **Attempt events.** Every provider call emits an `InferenceAttempt` to an injected `AttemptSink`. The default is a no-op; CB-06 adds persistence. `attemptId` is generated **before** the call. The fallback-model switch after a daily quota is still a separate attempt with its own row, even though it doesn't consume the retry counter.
5. **Route version.** Add `DETECT_ROUTE_VERSION` describing primary vs miss-only mode plus the model pair. Add `stage` (`detect`) and `routeVersion` to `LlmClassification.context` without changing published output.
6. **Boundary test.** Fail if any non-test source outside `ai/providers/` references a provider host.

**Scaffold — types.**
```ts
// web/src/lib/ai/types.ts
import type { LlmFailureKind } from "@/lib/detect-llm";

export type InferenceStage = "screen" | "detect" | "verify" | "action_draft" | "report";
export type UsageStatus = "reported" | "estimated" | "unknown";

export type InferenceUsage = {
  status: UsageStatus;
  inputTokens: number | null;
  cachedInputTokens: number | null; // provider-reported subset of inputTokens
  outputTokens: number | null;
  reasoningTokens: number | null; // may already be inside outputTokens; never add twice
};

export type InferenceAttempt = {
  attemptId: string;
  logicalOperationId: string; // one classification of one conversation in one run
  attemptOrdinal: number; // 1-based across retries and fallback switches
  tenantId: string;
  conversationId?: string;
  detectionRunId?: string;
  stage: InferenceStage;
  routeVersion: string;
  provider: "groq";
  model: string;
  promptVersion: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  status: "succeeded" | "failed" | "timeout" | "cancelled";
  errorCategory?: LlmFailureKind | "network";
  httpStatus?: number;
  providerRequestId?: string;
  usage: InferenceUsage;
};

export type AttemptSink = (attempt: InferenceAttempt) => void;
```

**Scaffold — usage parser.**
```ts
// web/src/lib/ai/usage.ts
import type { InferenceUsage } from "./types";

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export const UNKNOWN_USAGE: InferenceUsage = {
  status: "unknown", inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null,
};

/** OpenAI-compatible `usage`. Field names must be re-checked against the provider's current docs. */
export function parseOpenAiCompatibleUsage(payload: unknown): InferenceUsage {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== "object") return UNKNOWN_USAGE;
  const prompt = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const completion = usage.completion_tokens_details as Record<string, unknown> | undefined;
  const parsed: InferenceUsage = {
    status: "reported",
    inputTokens: count(usage.prompt_tokens),
    cachedInputTokens: count(prompt?.cached_tokens),
    outputTokens: count(usage.completion_tokens),
    reasoningTokens: count(completion?.reasoning_tokens),
  };
  return parsed.inputTokens === null || parsed.outputTokens === null ? { ...parsed, status: "unknown" } : parsed;
}
```

**Scaffold — boundary test.**
```ts
// web/src/lib/ai/boundary.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const PROVIDERS = path.join(SRC, "lib", "ai", "providers") + path.sep;
const HOSTS = /api\.groq\.com|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

describe("model provider boundary", () => {
  it("only ai/providers references provider hosts", () => {
    const offenders = [...sources(SRC)].filter((file) => !file.startsWith(PROVIDERS) && HOSTS.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

**Parity checklist** (each item needs a test that passes before and after): request body bytes (`groqChatBody`, including `reasoning_effort` switching for non-Qwen models); 6 s timeout → `timeout`; 429 with `Retry-After` within / above the cap; 5xx retry with backoff `200 * 2^attempt`; daily quota → fallback without consuming an attempt; concurrent daily-quota race (fixed 2026-10-02 per PROJECT_STATE); `reasoning` field parse fallback; `shape` failure; heuristic fallback on failure; primary vs miss-only selection; skipped-ID resume order.

**Acceptance.**
- [ ] Existing detection and route tests pass unmodified.
- [ ] The boundary test passes, and `rg "api.groq.com" web/src` matches only `ai/providers/groq.ts` (plus tests).
- [ ] Each attempt (including fallback and retries) emits exactly one event with a unique `attemptId`, verified by tests that count events in retry, fallback, and timeout scenarios.
- [ ] Published signals, evidence strings, and `detectionContext` model/prompt values are byte-identical for a frozen fixture run.

**Rollback.** Revert. No data changes.

---

### CB-06 — Durable inference attempt ledger

**Priority** P0 · **Depends on** CB-05 · **Decisions** D2 · **Size** 1.5–2.5 days

**Goal.** For any detection run, the database answers: which models ran, how many attempts, tokens, latency, retries, and estimated cost. Unknowns are explicit.

**Files.** Backend new: a migration (`down_revision` from `alembic heads`), `backend/app/models/inference_attempt.py`, `backend/app/schemas/inference_attempt.py`, `backend/app/services/inference_ledger.py`, `backend/app/services/inference_rates.py`, `backend/app/api/routes/inference.py`, `backend/tests/test_inference_ledger.py`. Backend modify: `backend/app/main.py` (router), `backend/app/models/__init__.py`, `backend/tests/test_postgres_migrations.py` (assert the table and constraints). Web new: `web/src/lib/ai/ledger.ts`. Web modify: `web/src/lib/backend-client.ts`, plus the run entry points that call `runHybridDetection` (`web/src/app/api/ingest/route.ts`, `web/src/app/api/detect/route.ts`, `web/src/lib/live-ingest/accept.ts`, and any others found by `rg runHybridDetection web/src`).

**Steps.**
1. Migration and model (scaffold below).
2. `POST /v1/tenants/{tenant_id}/inference-attempts` accepts a batch of ≤500 rows. It is idempotent on `(tenant_id, attempt_id)`: a replay is a no-op, and a finalized row never reverts to `pending`. It rejects rows for another tenant.
3. `GET /v1/tenants/{tenant_id}/inference-usage?from=&to=&group_by=day|model|stage|run` and `GET …/detection-runs/{run_id}/inference` return aggregates only, never text.
4. Cost estimation: `inference_rates.py` holds a dated rate table **entered by a human from official pricing pages**. It starts empty, so cost is `unknown`. Never copy prices from the CTO report.
5. Web `ledger.ts` (D2 default):
   - A per-run buffer is the `AttemptSink`.
   - Before the LLM pass, preflight the ledger endpoint. If it is unreachable, skip the LLM and run heuristics only (the existing fail-soft path), and record the reason in `LlmPassStats`.
   - Flush in `finally` with up to 3 retries. A flush failure logs counts only (no text) and increments an alertable metric.
6. Link `detection_run_id` using the deterministic run ID already used for publication.

**Scaffold — migration** (house style from `009_*`).
```python
"""Inference attempt ledger: one row per billable provider attempt; never stores prompt or transcript text."""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_inference_attempts"
down_revision: Union[str, None] = "<output of `alembic heads`>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inference_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(64), nullable=False),
        sa.Column("logical_operation_id", sa.String(64), nullable=False),
        sa.Column("attempt_ordinal", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=True),
        sa.Column("detection_run_id", sa.String(64), nullable=True),
        sa.Column("job_id", sa.String(64), nullable=True),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("route_version", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("prompt_version", sa.String(128), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error_category", sa.String(32), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("provider_request_id", sa.String(128), nullable=True),
        sa.Column("usage_status", sa.String(16), nullable=False),
        sa.Column("input_tokens", sa.BigInteger(), nullable=True),
        sa.Column("cached_input_tokens", sa.BigInteger(), nullable=True),
        sa.Column("output_tokens", sa.BigInteger(), nullable=True),
        sa.Column("reasoning_tokens", sa.BigInteger(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_version", sa.String(64), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(14, 8), nullable=True),
        sa.Column("cost_status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "attempt_id", name="uq_inference_attempts_tenant_attempt"),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'timeout', 'cancelled')",
            name="ck_inference_attempts_status",
        ),
        sa.CheckConstraint(
            "usage_status IN ('reported', 'estimated', 'unknown')", name="ck_inference_attempts_usage_status"
        ),
        sa.CheckConstraint(
            "cost_status IN ('estimated', 'reconciled', 'unknown')", name="ck_inference_attempts_cost_status"
        ),
        sa.CheckConstraint(
            "COALESCE(input_tokens, 0) >= 0 AND COALESCE(cached_input_tokens, 0) >= 0"
            " AND COALESCE(output_tokens, 0) >= 0 AND COALESCE(reasoning_tokens, 0) >= 0",
            name="ck_inference_attempts_tokens_nonnegative",
        ),
    )
    op.create_index("ix_inference_attempts_tenant_started", "inference_attempts", ["tenant_id", "started_at"])
    op.create_index("ix_inference_attempts_tenant_run", "inference_attempts", ["tenant_id", "detection_run_id"])


def downgrade() -> None:
    op.drop_index("ix_inference_attempts_tenant_run", table_name="inference_attempts")
    op.drop_index("ix_inference_attempts_tenant_started", table_name="inference_attempts")
    op.drop_table("inference_attempts")
```

**Scaffold — cost estimate.**
```python
# backend/app/services/inference_rates.py
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Rate:
    version: str  # e.g. "groq-qwen3.8-27b-2026-10-07"
    provider: str
    model: str
    input_per_mtok: Decimal
    cached_input_per_mtok: Decimal | None
    output_per_mtok: Decimal
    valid_from: date
    source_url: str


RATES: tuple[Rate, ...] = ()  # entered by a human from official pricing; never from the CTO report


def estimate_cost(rate: Rate | None, input_tokens: int | None, cached: int | None, output_tokens: int | None):
    """Cached tokens are a subset of input; reasoning tokens are inside output. Verify per provider."""
    if rate is None or input_tokens is None or output_tokens is None:
        return None, "unknown"
    cached = cached or 0
    cached_rate = rate.cached_input_per_mtok if rate.cached_input_per_mtok is not None else rate.input_per_mtok
    total = (
        Decimal(max(input_tokens - cached, 0)) * rate.input_per_mtok
        + Decimal(cached) * cached_rate
        + Decimal(output_tokens) * rate.output_per_mtok
    ) / Decimal(1_000_000)
    return total.quantize(Decimal("0.00000001")), "estimated"
```

**Tests.** Replayed batch is idempotent; finalized → pending is rejected; three billable attempts produce three rows even when one signal publishes; timeout without usage gives `usage_status='unknown'` and `cost_status='unknown'`; a cross-tenant row in the batch rejects the whole batch; aggregation totals match row sums; no text columns exist (assert on column names); ledger preflight failure means zero provider calls with heuristics still publishing; Postgres migration upgrade from the prior head.

**Acceptance.**
- [ ] The six-question query (§13.3) answers for a test run on Postgres.
- [ ] Unknown usage and unknown cost are counted and visible, never zero-filled.
- [ ] The ledger contains no prompt, transcript, or quote text.
- [ ] The D2 crash window is documented in the task record and alerting is planned (CB-15).

**Rollback.** Disable the sink (heuristics-only if the preflight fails is already safe). The table is additive.

---

### CB-07 — Spend reservations, limits, and kill switch

**Priority** P0 · **Depends on** CB-06 · **Decisions** D4 · **Size** 0.5–1 day (switches) + 1–2 days (reservations)

**Goal.** Spend stops before the provider call when a budget is exhausted or a switch is off, and concurrent runs cannot overspend.

**Current controls (verified):** the `DETECT_LLM=0` env kill switch (needs a redeploy); per-run call cap; attempt cap; concurrency 2; `Retry-After` cap.

**Steps.**
1. Add tables `inference_controls(scope PK: 'global' | tenant_id, enabled, reason, updated_by, updated_at)` and `inference_budgets(tenant_id, budget_day, limit_usd, reserved_usd, spent_usd, PK(tenant_id, budget_day))`.
2. Before each run, read the controls with a cache of at most 30 s; the propagation bound is documented in D4. If disabled, run heuristics only and surface a clear "AI paused" reason in the pass stats and the UI.
3. Before each attempt, reserve an estimated cost of `max_tokens × output rate + input estimate`. Settle on finalize (actual or estimated). Release stale reservations older than N minutes via a sweep.
4. Admin-only endpoints to pause and resume, which are audited once CB-18 lands.
5. When rates are unknown (empty `RATES`), enforce an **attempt-count** budget instead of USD, and say so in the UI and the task record.

**Scaffold — atomic reserve.**
```sql
UPDATE inference_budgets
   SET reserved_usd = reserved_usd + :estimate
 WHERE tenant_id = :tenant_id
   AND budget_day = :day
   AND spent_usd + reserved_usd + :estimate <= limit_usd
RETURNING limit_usd - spent_usd - reserved_usd AS remaining_usd;
-- zero rows → budget exhausted → do not call the provider
```

**Acceptance.**
- [ ] Two concurrent runs cannot both spend the last remaining budget (Postgres test with two connections).
- [ ] Retries and fallback attempts reserve budget too.
- [ ] Exhausted or disabled routes make zero provider calls and leave a resumable state with a reason.
- [ ] The day boundary uses the D4 timezone and is tested across midnight IST.
- [ ] The task record states whether enforcement uses estimates or reconciled spend.

---

### CB-08 — Immutable source evidence anchors

**Priority** P0 · **Depends on** CB-00 · **Decisions** D3 · **Size** 2–4 days

**Goal.** Every displayed quote is reconstructed server-side from `(message_id, start, end, text_sha256)`. Anything that can't be reconstructed is shown as unavailable, never fabricated.

**Files.** Backend new: a migration (`messages.content_sha256`; `signal_evidence` table; `signal_predictions.evidence_status`), `backend/app/models/signal_evidence.py`, `backend/app/services/evidence_anchors.py`, `backend/scripts/backfill_signal_evidence.py`, `backend/tests/test_evidence_anchors.py`. Backend modify: `backend/app/services/ingestion.py` / `backend/app/services/conversations.py` (set the hash on every message write), `backend/app/services/detection_runs.py` (resolve anchors in `reconcile_detection` after `validate_customer_evidence`), and the prediction/review schemas and routes that serve evidence. Web modify: the evidence display in `web/src/components/SignalReviewBody.tsx` and related "Why This Fired" components, consuming server-reconstructed quotes.

**Design rules (D3).**
- Offsets are Python `str` indices, which are Unicode code points, over exact `messages.content`, half-open. **All offset math stays in Python.** The web displays the server-reconstructed text, so no UTF-16 conversion is needed in TypeScript.
- Matching uses the existing validator's rule: whitespace-normalized substring of one customer turn, plus the `…` prefix rule for clipped quotes (prefix ≥ 60 characters).
- Ambiguity rule: the **latest** customer turn containing the span wins, consistent with the prompt's final-intent rule; within a turn, the first occurrence wins. Record the number of candidate turns.
- A content change on re-upload makes `content_sha256` differ, so anchors become `stale` and the signal shows "Source changed — re-run detection". Feedback history is preserved.

**Scaffold — resolver.**
```python
# backend/app/services/evidence_anchors.py
import hashlib
from dataclasses import dataclass


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Anchor:
    message_id: str
    start: int  # code-point offset into Message.content, inclusive
    end: int  # exclusive
    text_sha256: str
    candidate_turns: int


def _collapse(text: str) -> tuple[str, list[int]]:
    """Whitespace-collapsed text (same rule as str.split) plus each output char's index in `text`."""
    out: list[str] = []
    index: list[int] = []
    gap_at: int | None = None
    for i, ch in enumerate(text):
        if ch.isspace():
            if out and gap_at is None:
                gap_at = i
            continue
        if gap_at is not None:
            out.append(" ")
            index.append(gap_at)
            gap_at = None
        out.append(ch)
        index.append(i)
    return "".join(out), index


def resolve_anchor(quote: str, customer_turns: list[tuple[str, str]]) -> Anchor | None:
    """customer_turns: (message_id, content) in conversation order."""
    needle = " ".join(quote.split())
    if needle.endswith("…"):
        prefix = needle[:-1].rstrip()
        needle = prefix if len(prefix) >= 60 else needle
    if not needle:
        return None
    hits: list[Anchor] = []
    for message_id, content in customer_turns:
        collapsed, index = _collapse(content)
        at = collapsed.find(needle)
        if at >= 0:
            end = index[at + len(needle) - 1] + 1
            hits.append(Anchor(message_id, index[at], end, text_sha256(content), 0))
    if not hits:
        return None
    latest = hits[-1]
    return Anchor(latest.message_id, latest.start, latest.end, latest.text_sha256, len(hits))


def reconstruct(anchor: Anchor, content: str) -> str | None:
    if text_sha256(content) != anchor.text_sha256:
        return None
    if not 0 <= anchor.start < anchor.end <= len(content):
        return None
    return content[anchor.start:anchor.end]
```

**Steps.**
1. Migration: add nullable `messages.content_sha256` with a backfill in tenant-scoped chunks; add `signal_evidence(id, tenant_id, prediction_id FK, message_id, start_cp, end_cp, text_sha256, candidate_turns, created_at, UNIQUE(prediction_id, message_id, start_cp, end_cp))`; add nullable `signal_predictions.evidence_status` (`valid` | `unresolved` | `stale`).
2. Write the hash on every message insert or update.
3. In `reconcile_detection`, resolve an anchor for every quote and insert evidence rows in the same transaction. Failing to resolve is impossible there, because `validate_customer_evidence` already raised. Assert that invariant in a test.
4. Read path: evidence APIs return `{message_id, start, end, quote: reconstruct(...)}`, or `status=stale|unresolved` with a reason.
5. Backfill script with `--tenant`, `--dry-run`, chunking, and a checkpoint. Legacy quotes that don't resolve are marked `unresolved`; nothing is deleted.
6. UI: render the reconstructed quote, collapsing whitespace for display. For stale or unresolved evidence, use a quiet labeled state with a next step ("Re-run detection"), using the existing chrome components.

**Tests.** Repeated identical quotes across turns (latest wins, `candidate_turns=2`); emoji and astral characters (assert code-point slicing); combining marks; Hindi and Hinglish; CRLF and multiple spaces; quotes clipped with `…`; redacted tokens; a quote spanning a whitespace collapse; nonexistent message; stale hash; negative or out-of-range span; cross-tenant `message_id` (same ID string in two tenants).

**Acceptance.**
- [ ] 100% of displayed evidence passes `reconstruct` (automated check over all active predictions in the test DB).
- [ ] Release evidence: a 100-signal reconstruction sample on the hosted pilot tenant, **run by a human** with read access, recorded in the task record.
- [ ] INR commercial grounding is unchanged (`test_commercial_evidence.py` passes unmodified).
- [ ] Unresolved or stale evidence displays as unavailable, and business records stay.

---

### CB-09 — Frozen evaluation pack and promotion gate

**Priority** P1 · **Depends on** CB-05, CB-06, CB-08 (metrics need them; corpus work can start earlier) · **Decisions** D0 (rule change), D5 · **Size** 3–5 days

**Goal.** Any detection, prompt, or route change yields a comparable artifact. Promotion is a mechanical gate result, not a judgment call made after the fact.

**Existing assets (verified):** `web/eval/promptfoo/` (signal and injection datasets, live Groq), `npm run eval:partner-export`, `*.eval.test.ts` packs (some skip when absent), and the synthetic `web/data/samples/pilot/independent-rehearsal/`.

**Files.** New: `web/eval/gold/manifest.json`, `web/eval/gold/{dev,validation}/` (synthetic, in repo), `web/eval/gate/{run-gate.ts,compare.ts,thresholds.json,artifact.schema.json}`, `web/eval/gate/replay/<route_version>/` (recorded model outputs for synthetic data only). Modify: `web/package.json` scripts `eval:gate`, `eval:gate:record`.

**Steps.**
1. Corpus: retention / upsell / lead / none; English, Hindi, and Hinglish; ops and fraud negatives; long conversations; late intent changes; ambiguity; redaction artifacts; prompt injection. Store a sha256 per split in `manifest.json`. A partner-derived holdout lives outside the repo; only its checksum and n live in the manifest.
2. `eval:gate:record` (live, opt-in, spend-capped, synthetic only): runs the current route and stores raw model JSON per item as replay fixtures.
3. `eval:gate` (offline, deterministic, runs in CI): applies the current parsing, grounding, and reconciliation code to the replay fixtures, then computes metrics. When the detection code changes, this catches regressions with no network.
4. Metrics per type: TP, FP, FN, precision, recall, F1 with Wilson 95% intervals and n; FP per 100 conversations; evidence validity; abstention; coverage; p50/p95 latency (live mode only); cost and unknown-cost fraction (from the ledger in live mode).
5. Recall counts **all** labeled positives, including conversations screened out by heuristics or a cheap stage.
6. `compare.ts` applies the human-approved `thresholds.json` (D5) and exits non-zero on failure. A missing required holdout **fails** the gate; it never skips.
7. Keep the rule distinction: labeled P/R is the engineering gate; human keep-set SignalScore stays the customer claim.

**Scaffold — `thresholds.json`** (Proposed initial values; a human approves before CI enforces).
```json
{
  "version": 1,
  "max_per_type_precision_drop_pp": 2,
  "max_per_type_recall_drop_pp": 2,
  "min_surfaced_evidence_validity": 1.0,
  "max_injection_critical_failures": 0,
  "max_tenant_failures": 0,
  "require_holdout": true,
  "min_items_per_type": 30
}
```

**Scaffold — artifact (abridged).**
```json
{
  "artifact_version": 1,
  "git_sha": "…",
  "corpus": { "id": "gold-v1", "split": "validation", "manifest_sha256": "…", "n": 0 },
  "route": { "route_version": "…", "models": ["…"], "prompt_version": "…", "mode": "replay" },
  "per_type": { "retention": { "tp": 0, "fp": 0, "fn": 0, "precision": null, "recall": null, "precision_ci95": [null, null] } },
  "fp_per_100": null,
  "evidence_validity": { "valid": 0, "surfaced": 0 },
  "abstention_rate": null,
  "cost": { "attempts": 0, "unknown_cost_attempts": 0, "estimated_usd": null }
}
```

**Acceptance.**
- [ ] Baseline artifact committed for the current route.
- [ ] A deliberately broken parser change fails `eval:gate` in CI.
- [ ] Sample sizes and intervals appear in every artifact; empty denominators are `null`, not 0.
- [ ] The CI job runs without network or keys.

---

## 9. Phase 2: canonical and economically scalable intelligence (≈ days 31–60)

### CB-10 — Canonical Postgres operations

**Priority** P1 · **Depends on** CB-03, CB-08 (CB-04 for multi-tenant rollout) · **Decisions** D6 · **Size** 4–7 days

**Goal.** In production mode, Postgres is the only writer for operational state. JSON remains only for local demo mode.

**Steps.**
1. From `baseline.md`, build an entity table: entity, current writer(s), current reader(s), target owner, cutover slice.
2. Add `SIOONA_STATE_MODE=postgres|json-demo`. Production refuses `json-demo` at boot.
3. Per slice, in D6 order: tenant-scoped backfill with reconciliation (counts and hashes) → shadow-read comparison (keep-set, filters, pagination, outcomes) with no extra writes → cut over → observe → remove the JSON writer in a separate PR.
4. A database outage returns recoverable UI errors instead of falling back to stale JSON.

**Acceptance.**
- [ ] A fresh production tenant reconstructs the dashboard after a web restart with no runtime JSON file.
- [ ] Every write has one documented destination.
- [ ] Demo or sample data cannot overwrite a live tenant (test).
- [ ] Reconciliation shows zero unexplained signal or feedback loss.

**Rollback.** Keep the old reader until the observation window closes. Never re-enable JSON as a writer after cutover.

---

### CB-11 — Durable jobs and backend execution

**Priority** P1 · **Depends on** CB-06, CB-07, CB-10 · **Decisions** D0 (lifts "classify-on-FastAPI" and "429 retries"), D9 · **Size** 3–5 days, plus the Python gateway port

**Goal.** An accepted upload returns a job ID quickly, and processing survives browser close and worker restart.

**Steps.**
1. Create a `jobs` table: id, tenant_id, kind, payload reference (not text), status, priority, attempts, max_attempts, run_after, lease_owner, lease_expires_at, heartbeat_at, cursor, last_error_category, timestamps.
2. Enqueue only after the canonical ingestion commit (an outbox row in the same transaction).
3. Add a worker: `backend/app/worker.py` run as `python -m app.worker`, declared in `render.yaml` as a background worker; a human applies it.
4. Port the gateway to Python with parity tests against CB-09 replay fixtures. Copy the prompt from `web/eval/promptfoo/system-prompt.txt` with a checksum test, so both copies can't drift.
5. The worker writes ledger rows as `pending` **before** each provider call, which closes the D2 gap.
6. Publication stays in `reconcile_detection`. Its identity `(tenant, run_id, conversation)` already dedupes replays.

**Scaffold — claim and recover.**
```sql
WITH next AS (
  SELECT id FROM jobs
   WHERE status IN ('queued', 'retryable_failed') AND run_after <= now()
   ORDER BY priority DESC, created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1
)
UPDATE jobs j
   SET status = 'leased', lease_owner = :worker_id,
       lease_expires_at = now() + interval '60 seconds', attempts = j.attempts + 1
  FROM next
 WHERE j.id = next.id
RETURNING j.*;

UPDATE jobs SET status = 'retryable_failed', lease_owner = NULL
 WHERE status IN ('leased', 'running') AND lease_expires_at < now();
```

**Acceptance.**
- [ ] Kill the worker before or after the provider response and before or after the DB commit: there is at most one active publication, and every attempt is metered.
- [ ] Two workers never hold the same job (Postgres test).
- [ ] Cancellation mid-call and retry exhaustion leave clear terminal states.
- [ ] Old and new processors never run on the same publishing identity during rollout.

---

### CB-12 — XLSX and email exports through one normalizer

**Priority** P1 · **Depends on** CB-10 · **Size** 2–4 days

**Steps.**
1. Lock the current CSV / JSON / Intercom / WhatsApp behavior with parity fixtures before adding formats (`web/src/lib/ingest.ts`, `ingest-platforms.ts`).
2. Add XLSX and email (EML/MBOX, if customer demand confirms it) in whichever layer owns parsing after CB-10/CB-11, keeping **one** normalization path. Never split parsers across layers. For XLSX, read cell values only; formulas and macros never execute. For email, never fetch or execute attachments, and normalize HTML safely.
3. Add a mapping preview and row-level errors, an explicit timezone policy, size limits, and a partial-failure policy.

**Acceptance.**
- [ ] Every format produces the same normalized model and goes through redaction, evidence, and detection.
- [ ] Malformed, oversized, wrong-encoding, duplicate-ID, empty-message, and missing-timestamp inputs are tested.
- [ ] Supported formats are documented; "email" does not mean every vendor export.

---

### CB-13 — Routing stages and controlled promotion

**Priority** P1 · **Depends on** CB-09, CB-06 · **Decisions** D5 · **Size** 3–5 days

**Goal.** Choose models by quality-adjusted cost per actionable signal, not by cheapest token.

**Steps.**
1. Define routes as code (`route_version`, stages `screen → detect → verify`, escalation rules) in the gateway.
2. Benchmark at least: the current Qwen baseline, GPT-OSS, one currently available low-cost provider, and cheap-screen → stronger-verifier. Verify availability and prices **on the experiment date** and record the source URLs.
3. Stratify results by type, language, length, and late intent change. Recall includes screened-out items.
4. Canary on an approved tenant slice and monitor evidence failures, unknown costs, budget exhaustion, and human acceptance.

**Acceptance.**
- [ ] The promotion PR carries an artifact pair (baseline vs candidate) and a passing gate.
- [ ] Fallback models are evaluated too; availability alone doesn't qualify a model.
- [ ] Reverting to the baseline route is a config change, and run history is preserved.

---

### CB-14 — Historical batch processing and safe caching

**Priority** P2 · **Depends on** CB-11, CB-13 · **Size** 2–4 days (batch) + 1–2 days (prefix caching)

**Steps.** Use provider batch APIs only where they are supported and approved, and keep live jobs on the low-latency route. Persist submission IDs, polling cursors, partial results, expiry, and cancellation. Order prompts with the stable prefix first (definitions, schema, evidence rules, examples, tenant taxonomy), then the conversation. Cache keys are tenant + source hash + prompt / model / taxonomy / route / privacy-policy versions.

**Acceptance.**
- [ ] 10,000 synthetic conversations complete with no duplicate publication after forced restarts.
- [ ] Missing batch results are detected and resumed, and batch plus retried standard calls are all in the ledger.
- [ ] Cache hits never cross tenants or reuse stale configuration. Prefix-cache savings are measured from ledger `cached_input_tokens`, not assumed.

---

### CB-15 — Tenant economics and reliability dashboard

**Priority** P1 · **Depends on** CB-06, CB-10 · **Size** 2–3 days (+ 2–4 days for indexed search)

**Steps.** Build admin-only metrics APIs and one internal page with four panels: funnel, quality, reliability, and economics (§13). Then add Postgres full-text or trigram search and indexed filters for the queue, before considering vector search.

**Acceptance.**
- [ ] Totals reconcile to the §13 SQL for a fixed tenant and window.
- [ ] Empty denominators show "unavailable". Estimated vs reconciled cost, unknown fractions, timezone, and currency are labeled.
- [ ] Alerts exist for unknown or unfinished attempts, ledger flush failures, spend anomalies, reservation drift, queue age, 429 bursts, and invalid evidence. Each alert has an owner and a runbook line.

---

## 10. Phase 3: supervised integrations and lifecycle (≈ days 61–90)

These cards are conditional on customer demand and explicit authorization (D10).

### CB-16 — Productionize one live source

**Priority** P3, customer-triggered · **Depends on** CB-03, CB-07, CB-11 · **Size** ~1 week (Intercom); 1–2+ weeks (WhatsApp provider)

**Steps.** Audit `web/src/lib/live-ingest/` and `web/src/app/api/ingest/live/*`. Replace shared-secret matching with provider signature verification per current official docs. Bind credentials to a tenant server-side; the request header no longer selects the tenant. Enqueue canonical events with replay protection, a cursor or checkpoint, dead-letter state, and source deletion semantics.

**Acceptance.**
- [ ] Replayed or duplicate events create no duplicate conversations or signals.
- [ ] Out-of-order events follow a written version policy.
- [ ] Invalid signatures and forged tenant selectors fail.
- [ ] Revoking the integration stops ingestion, and rate limits resume safely.
- [ ] Customer consent and a monitoring plan are recorded before enabling.

### CB-17 — Explicitly supervised external action

**Priority** P2, separately authorized · **Depends on** CB-03, CB-08, CB-11, CB-18 (audit) · **Size** 4–7 days

**Steps.** Extend `supervised_action_decisions` with versioned `action_proposals` (payload JSON plus payload sha256) and an `action_executions` outbox. Approval binds payload hash, target, actor, tenant, expiry, and action version, and any edit invalidates it. Use least-privilege tenant credentials. Retries are deduplicated by execution ID.

**Acceptance.**
- [ ] No external write without current permission and an approval of that exact payload.
- [ ] Approve Draft never becomes send permission implicitly.
- [ ] A provider timeout after submit puts the execution in `unknown`, requiring reconciliation. No blind retry.
- [ ] The audit trail shows proposed → approved → attempted → succeeded / failed / unknown.
- [ ] Release tests use sandbox targets only.

### CB-18 — Audit, retention, export, and deletion

**Priority** P2 (audit primitives before CB-17) · **Depends on** CB-03, CB-10 · **Decisions** D11 · **Size** 2–4 days (audit) + 3–5 days (lifecycle)

**Steps.** Add an append-only `audit_events` table (actor, tenant, resource and version, operation, result, correlation ID, time; no PII or text). Add retention per data class, tenant export, and resumable tenant deletion with confirmation and legal hold. Extend the existing `wipe_tenant_data` (`backend/app/services/tenant_data.py`) rather than writing a parallel path.

**Acceptance.**
- [ ] Export contains only the tenant's data.
- [ ] Deletion covers canonical rows, evidence, ledger, caches, jobs, and integration secrets, and resumes after interruption.
- [ ] Deleted messages leave no displayable evidence.
- [ ] Backup expiry is documented instead of promising immediate deletion from backups.

### CB-19 — Reproducible infrastructure, recovery, and launch review

**Priority** P2 · **Depends on** foundations plus approved integrations · **Size** 1–2 days (codify) + drills

**Steps.** With authorized read access, a human inventories Vercel, Render, and Neon. Codify the API service and worker in `render.yaml` without secrets. Set up staging parity, backups and a restore drill, alerts, runbooks, and a deploy/rollback procedure. Keep the marketing-site deployment separate.

**Acceptance.**
- [ ] Staging is recreated from config, and the upload → review path passes.
- [ ] Worker pause/resume, provider outage with the kill switch, a DB outage, and a backup restore are exercised, with measured RTO/RPO approved by the business.
- [ ] No uptime commitment until 30–60 days of telemetry exist.

### Deferred (needs a documented customer, regulatory, or performance trigger)

SSO/SAML (1–3 weeks; may move earlier if D1 or the first customer requires it), additional CRMs (~1 week each), SOC 2 (organizational program), regional residency, semantic/vector search (only after SQL search proves insufficient), fine-tuning, Kafka, Kubernetes, LangGraph, microservices. Code changes alone never establish compliance.

---

## 11. Testing, commands, and release gates

### 11.1 Test tiers

1. **Unit/contract:** parsers, gateway mapping, usage parsing, anchors, cost math, state machines.
2. **API/service (SQLite):** authorization matrix, review/draft semantics, idempotency, budgets.
3. **Postgres integration:** migrations, constraints, locks, leases, RLS, runtime role, concurrency. SQLite cannot prove these.
4. **Browser E2E:** upload → evidence → review → persisted decision, expired session, backend outage, empty states, no sends.
5. **Offline eval gate:** replay fixtures, deterministic, no network.
6. **Live benchmark:** opt-in, synthetic or approved data, spend cap.
7. **Staging:** migration rehearsal, smoke, recovery drills.

### 11.2 Commands (verified against `package.json` and `test.yml`)

```bash
# Web (CI parity: Node 22)
cd web && npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build

# Marketing site
cd site && npm ci && npm run lint && npm run typecheck && npm test && npm run build

# Backend (local venv convention from PROJECT_STATE)
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest

# Backend on Postgres: disposable container; the test refuses any DB not named sioona_migration_test
docker run --rm -d --name sioona-pg -e POSTGRES_USER=sioona -e POSTGRES_PASSWORD=ci_only \
  -e POSTGRES_DB=sioona_migration_test -p 55432:5432 postgres:17
cd backend && PG_TEST_DATABASE_URL=postgresql+psycopg://sioona:ci_only@localhost:55432/sioona_migration_test \
  .venv/bin/python -m pytest tests/test_postgres_migrations.py -q
docker stop sioona-pg

# Migration graph (reads scripts only; no DB connection)
cd backend && alembic heads && alembic history | head -25
```

Notes:
- `web/vitest.setup.ts` already points `BACKEND_URL` at a closed port, so `npm test` never reaches a running local API.
- CI installs the Linux Rollup binary after `npm ci` (npm/cli#4828). Locally on macOS this is unnecessary.
- `npm run eval:signal`, `eval:signal:injection`, and `eval:signal:smoke` call providers; check the configuration and get approval before running them. `eval:gate` (CB-09) is the offline CI gate.
- Never point `PG_TEST_DATABASE_URL` or `DATABASE_URL` at a hosted database from an agent session.

### 11.3 Release gates

| Gate | Target | Proven by |
|---|---|---|
| Tenant isolation | 100% pass, zero open cross-tenant defects | `test_tenant_isolation.py` (SQLite + Postgres subset) |
| Evidence | 100% of displayed evidence reconstructs | CB-08 automated check + 100-signal hosted sample |
| Metering | ≥ 99.9% of production attempts accounted for; unknowns explicit and alerted | Ledger vs provider-side request counts over a window, where available |
| Model/prompt/route change | Approved artifact, gate passes | `eval:gate` + `compare.ts` |
| Migrations | Rehearsed on Postgres from the prior head; destructive steps human-reviewed | `test_postgres_migrations.py` + task record |
| Hosted schema | Hosted `alembic current` known before shipping a new revision | Human-run check recorded |
| `main` | PR + required checks + independent review | Ruleset verified via `gh api` |
| External actions | Explicit approval of the exact payload; audited result | CB-17 tests |
| Customer workflow | Upload → evidence → review → persisted decision after release | E2E + hosted smoke (PROJECT_STATE deploy gate) |

---

## 12. Migration and cutover playbook

**Expand → backfill → validate → cut over → observe → contract.**

1. Run `alembic heads` (one head only) and record hosted `alembic current` through a human with read access.
2. Expand: nullable columns and new tables first. Check lock duration for indexes on large tables (`CREATE INDEX CONCURRENTLY` needs a non-transactional migration; review it explicitly).
3. Backfill in bounded tenant chunks with a checkpoint, restart, and conflict policy. Scripts default to `--dry-run`.
4. Validate: reconcile counts, hashes, ownership, unique active predictions, feedback/outcomes, evidence coverage, and ledger totals.
5. Rehearse an upgrade from a representative prior revision on Postgres. Add the case to `test_postgres_migrations.py` (it already parametrizes a prior revision).
6. Before any destructive step, have a verified backup and restore path. Git is not a database restore point.
7. Cut over behind tenant or config flags. Shadow comparison must not double-write effects.
8. Observe discrepancy, error, and latency metrics, with pause thresholds.
9. Contract (drop old columns or JSON writers) in a separate reviewed PR after the observation window.

Downgrades can lose data; say so in the migration docstring. Prefer forward repair. Keep web rollback, worker rollback, schema recovery, and external-action reconciliation as separate procedures.

---

## 13. Metrics, cost model, and SQL

### 13.1 Definitions (always show the denominator)

| Metric | Definition |
|---|---|
| Per-type precision / recall | TP/(TP+FP) and TP/(TP+FN) on labeled held-out data; recall includes screened-out items |
| Human SignalScore (pilot claim) | Existing keep-set, week-window formula: correct / reviewed |
| Human acceptance rate (ops metric) | correct / reviewed over a date range, all keep-sets; not the pilot claim |
| Evidence validity | valid displayed evidence / displayed evidence |
| Coverage | completed eligible conversations / eligible; paused, failed, and skipped shown separately |
| AI cost per conversation | attempt cost / processed conversation cohort |
| AI cost per correct (or acted) signal | attributed attempt cost / distinct correct (acted) signals in the cohort; disclose feedback lag |
| Processing latency | ingestion accepted → durable publication (provider latency reported separately) |
| Technical gross margin | (tenant revenue − attributed direct COGS) / tenant revenue, with allocation assumptions disclosed |

A zero denominator means "unavailable". Confidence is not a calibrated probability until calibration is measured. Recorded INR outcome value is customer-reported influence, not proven incremental revenue.

### 13.2 Cost formula

```text
attempt_cost = (input − cached) × input_rate + cached × cached_rate + output × output_rate  (per 1M tokens)
               + request or tool charges where applicable
```

Reasoning tokens are usually inside output; never add them twice. Keep estimated and reconciled costs separate. Store provider, model, tier/batch, currency, rate version, and validity dates. Forecast 10K/50K/100K volumes from **measured** token distributions, retries, escalation, cache hits, and batch eligibility. The CTO report's prices, token averages, and $40 platform base are illustrative and must not seed pricing.

### 13.3 Queries

Questions about one detection run (milestone exit for day 30):

```sql
SELECT provider, model, stage,
       count(*) AS attempts,
       count(*) FILTER (WHERE attempt_ordinal > 1) AS retries_or_fallbacks,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
       count(*) FILTER (WHERE usage_status = 'unknown') AS unknown_usage,
       sum(latency_ms) AS total_latency_ms,
       sum(estimated_cost_usd) AS estimated_cost_usd,
       count(*) FILTER (WHERE cost_status = 'unknown') AS unknown_cost
FROM inference_attempts
WHERE tenant_id = :tenant_id AND detection_run_id = :run_id
GROUP BY provider, model, stage;
```

Daily tenant economics (IST day per D4):

```sql
SELECT tenant_id,
       date_trunc('day', started_at AT TIME ZONE 'Asia/Kolkata') AS day_ist,
       count(*) AS attempts,
       sum(input_tokens) AS input_tokens,
       sum(cached_input_tokens) AS cached_input_tokens,
       sum(output_tokens) AS output_tokens,
       sum(estimated_cost_usd) AS estimated_cost_usd,
       count(*) FILTER (WHERE cost_status = 'unknown') AS unknown_cost_attempts,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
FROM inference_attempts
WHERE started_at >= now() - interval '30 days'
GROUP BY tenant_id, day_ist
ORDER BY day_ist DESC, estimated_cost_usd DESC NULLS LAST;
```

Human acceptance by type (columns verified against `signal_feedback` and `signal_predictions`). Drop `sp.active` to include superseded predictions' historical feedback.

```sql
SELECT sp.signal_type,
       count(*) AS reviewed,
       count(*) FILTER (WHERE sf.feedback = 'correct') AS correct,
       round(count(*) FILTER (WHERE sf.feedback = 'correct')::numeric / NULLIF(count(*), 0), 4) AS acceptance
FROM signal_predictions sp
JOIN signal_feedback sf ON sf.signal_id = sp.id AND sf.tenant_id = sp.tenant_id
WHERE sp.tenant_id = :tenant_id
  AND sf.reviewed_at >= :date_from AND sf.reviewed_at < :date_to
GROUP BY sp.signal_type
ORDER BY sp.signal_type;
```

Action and outcome funnel (columns verified on `signal_predictions`):

```sql
SELECT signal_type,
       count(*) AS signals,
       count(*) FILTER (WHERE acted) AS acted,
       count(*) FILTER (WHERE outcome IN ('retained', 'converted')) AS positive_outcomes,
       round(100.0 * count(*) FILTER (WHERE acted) / NULLIF(count(*), 0), 2) AS action_rate_pct,
       sum(outcome_value_inr) FILTER (WHERE outcome IN ('retained', 'converted')) AS influenced_value_inr
FROM signal_predictions
WHERE tenant_id = :tenant_id AND active
  AND created_at >= :date_from AND created_at < :date_to
GROUP BY signal_type;
```

### 13.4 Dashboard panels (CB-15)

- **Funnel:** ingested → processed → surfaced → reviewed → correct → acted → positive outcome → influenced value.
- **Quality:** SignalScore (keep-set), acceptance by type, gold-set P/R, false positives, evidence failures, abstention, calibration once measured.
- **Reliability:** ingestion success and recovery, queue depth and age, p50/p95 processing, 429 and error rate, retry rate, DB latency, connector errors.
- **Economics:** cost per conversation, per detected / correct / acted signal, COGS, revenue, and margin per tenant, with unknown-cost share shown.

---

## 14. UI acceptance for new or changed surfaces

Root `AGENTS.md`, `.cursor/rules/sioona-ui-app.mdc`, and `geist-design-system.mdc` apply in full; this section only adds what the roadmap introduces.

- Reuse the locked chrome (`SignalStatus`, `SignalScoreChip`, `SignalTypeChip`, `SignalUser`). New states (AI paused, evidence stale or unavailable, job running or failed, approval expired) are quiet labeled badges with a next step, never color alone.
- Long jobs acknowledge in under 500 ms with a job ID and a progress or status view. Back/Forward and deep links preserve job and filter state.
- The internal dashboard uses tabular numbers, `Intl` formatting for INR and USD, and explicit "Unavailable" for empty denominators.
- Ordinary customer flows never show provider, gateway, ledger, or model names unless that helps a decision. The internal engine name never appears in the UI.
- Lists over 50 rows paginate (server-side keyset already exists) or virtualize.

---

## 15. Copy-ready Cursor prompts

### 15.1 Implementation (start in Plan mode)

```text
Task: CB-XX — <title>. Spec: task card CB-XX in @docs/DEVELOPMENT_COOKBOOK.md.
Task record: @docs/development/tasks/CB-XX.md (create from cookbook §5.4 if missing).

PLAN FIRST. Do not edit files until I approve the plan.

1. Baseline: report branch, HEAD SHA, `git status --short`, and `cd backend && alembic heads`.
   Preserve unrelated changes. Check docs/development/decisions.md for every decision the card lists;
   if any is unrecorded, stop and list what you need.
2. Read: root AGENTS.md, the nested AGENTS.md of each package you will touch,
   .cursor/docs/PROJECT_STATE.md, .cursor/docs/architecture.md, and every file in the card's Files list.
   If code disagrees with cookbook §2, trust the code and report the difference.
3. Plan: commit-sized steps; files per step; tests per step (including the card's adverse cases);
   rollout flag; which acceptance box each step proves. If code already satisfies a step, cite file:line.
4. After approval, implement one step at a time and run the card's targeted tests after each step.
   Finish with cookbook §11.2 for every touched package. Record exact results and skips in the task record.
5. Stop and ask on any cookbook §5.3 stop condition.
6. Deliver: summary of the diff, updated task record, acceptance checklist with evidence, remaining risks,
   and the exact review prompt (§15.2) filled in with base and head SHAs.
Do not commit, push, merge, deploy, or start another card unless I ask.
```

### 15.2 Independent review (fresh chat, different model)

```text
Review CB-XX. Diff: `git diff <base_sha>...<head_sha>`.
Spec: task card CB-XX in @docs/DEVELOPMENT_COOKBOOK.md and @docs/development/tasks/CB-XX.md.
Read-only. Do not edit files.

Check, in priority order:
1. Cross-tenant exposure; authn/authz bypass; revocation; forged headers.
2. PII, transcript, or secret leakage (logs, ledger, caches, fixtures, error messages).
3. Destructive or irreversible migrations; deploy-order incompatibility; missing recovery path.
4. Idempotency, races, lease handling, duplicate publication, unknown external effects.
5. Unmetered attempts, zero-filled unknown usage, double-counted cached or reasoning tokens, budget races.
6. Evidence anchors: ownership, hash, code-point bounds, stale handling, final-intent ambiguity rule.
7. Eval leakage, screened-out false negatives, gate bypass via skips, unsupported quality claims.
8. Changed pilot semantics (review / Approve Draft / Acted / SignalScore) or inaccessible UI states.
9. Retry loops, silent failures, missing adverse-case tests.

Output: (a) findings table: severity P0–P3, file:line, failure scenario, minimal fix, test that proves it;
(b) acceptance boxes not demonstrated by evidence in the diff or task record; (c) open questions.
Separate confirmed defects from questions. No style comments unless they cause a defect.
Do not accept a passing summary as proof; check the code.
```

### 15.3 Continue a card

```text
Continue CB-XX from @docs/development/tasks/CB-XX.md.
First verify that the branch and HEAD match the record and that `git status` shows no unexpected changes.
Summarize completed steps, open review findings, and current authorization; propose the next step and wait for my OK.
Do not redo completed work or start another card.
```

### 15.4 Fix review findings

```text
Fix the review findings listed below for CB-XX, and only those. For each finding: write the failing test first,
make the minimal fix, and re-run that test plus the card's targeted suite. Update the task record's
review-findings section with the resolution and new head SHA. Do not change scope.
<paste findings>
```

---

## 16. Source traceability

Each recommendation in the CTO review mapped to where this cookbook handles it.

| CTO recommendation (source section) | Card / section |
|---|---|
| Do not rewrite; harden and consolidate (Executive summary) | Strategy, §4 |
| P0: tenant auth relies on shared token + asserted headers | CB-03, CB-04 |
| P0: no persistent inference-cost ledger | CB-06 |
| P0: generic evidence not `message_id + span` | CB-08 |
| P1: JSON + Postgres dual source; AI in the Next.js layer | CB-10, CB-11 |
| P1: coupled directly to Groq | CB-05, CB-13 |
| Doc drift: Next.js 15 vs 16 | CB-00, §2.2 |
| Miss-only vs primary ambiguity; routing policy as code; persist stage | §2.1, CB-00, CB-05 (step 5), CB-13 |
| Keep atomic ingestion, redaction, versioning, SignalScore, eval loop | §4.1, §4.2, CB-05 parity, CB-09 |
| Canonical adapter set incl. XLSX + email | CB-12 |
| Move parser execution server-side over time | CB-11, CB-12 |
| ERD additions: workspace/membership, inference call, evidence, audit | CB-03, CB-06, CB-08, CB-18 |
| RLS once the schema stabilizes | CB-04 |
| Missing gates: E2E, dependency scanning, cross-tenant suite, eval gate, branch protection, coverage, IaC | CB-02, CB-03, CB-09, CB-19 |
| Render API service dashboard-managed | CB-19 |
| Lock Python dependencies | CB-01 |
| P0 table: ledger, gateway, evidence, auth, locks, protect main, kill switches | CB-06, CB-05, CB-08, CB-03, CB-01, CB-02, CB-07 |
| P1 table: router stages, eval harness, Postgres SoT, jobs, XLSX/email, observability, E2E | CB-13, CB-09, CB-10, CB-11, CB-12, CB-15, CB-02 |
| P2 table: batch, prefix caching, CRM connector, audit, FTS/trigram, codify Render, retention/delete/export | CB-14, CB-14, CB-17, CB-18, CB-15, CB-19, CB-18 |
| P3 table: live Intercom, WhatsApp provider, CRM-specific, vector search, SSO, SOC 2, residency | CB-16, Deferred |
| Not now: microservices, Kubernetes, fine-tuning, LangGraph, Kafka, pgvector | Deferred |
| `ModelGateway` interface; Groq first, unchanged | CB-05 |
| Optimize quality-adjusted cost per actionable signal | CB-13, §13 |
| Staged pipeline: rules → cheap screen → verify → evidence validator → persist | CB-13, CB-08 |
| Historical → batch; live → low latency; stable-prefix caching | CB-14 |
| Cost scenarios are assumptions; replace with metering | §13.2, CB-06, CB-15 |
| Eval harness is the model procurement system; promotion rule | CB-09, CB-13 |
| Subscriptions (Cursor/ChatGPT plans) | Not a prerequisite; tool choice is the founder's |
| Repo access setup for Codex and Cursor; least privilege; no prod creds | §5.6 |
| Restructure agent instructions (root/web/backend AGENTS.md + rules) | CB-01, §5.7 |
| Agent workflow: implement → independent review → CI → human; never self-approve high-risk | §5.1, §5.2 |
| Task and review prompt templates | §15 |
| Allowed / never-provided agent resources | §5.6 |
| `inference_calls` table design (no prompts/transcripts) | CB-06 (corrected: per attempt, nullable usage, cost status) |
| CTO dashboard: funnel, quality, reliability, economics | CB-15, §13.4 |
| Sample SQL (daily economics, by stage, acceptance, outcome funnel) | §13.3 |
| Release gates table; no SLA before 30–60 days of telemetry | §11.3, CB-19 |
| 30/60/90-day milestones and acceptance | §6.4 |
| Freeze feature sprawl one sprint; build order | D0, build order at top |
| Own the dataset + evaluation loop; models are replaceable suppliers | §4, CB-09, CB-13 |
| Open questions: traffic, plans, bills, branch protection unknown | §2.1 unknowns, CB-00, CB-02, CB-19 |

**Corrections to the source design (deliberate):**
- Meter **attempts**, not logical calls. Retries and fallback switches bill separately, and the source's "do not double-count a successful call" wording could hide real cost.
- Token columns are nullable with `usage_status`. The source's `DEFAULT 0` would turn unknown usage into free usage.
- Evidence offsets are code points over persisted, redacted text, and stale anchors are first-class. Messages are currently mutable on re-upload, which the source did not address.
- The ERD is conceptual. Existing `signal_feedback` (one per prediction) and outcome-on-prediction cardinality are preserved.
- Provider prices and plan costs are not carried forward. Rates are entered with dates from official sources at benchmark time.

---

## Appendix A: Re-reading the source report

The source file is a JSON export with the Markdown report embedded. The shell cannot list `~/Downloads` (macOS privacy), but Python can read the file directly:

```bash
python3 - <<'PY'
import json, re
p = "/Users/sanket/Downloads/Sioona Engineering Evaluation and CTO Onboarding Plan"
d = json.load(open(p, encoding="utf-8"))
md = "\n".join(x for x in d["widget_state"]["report_message"]["content"]["parts"] if isinstance(x, str))
open("/tmp/cto-report.md", "w").write(re.sub(r"\ue200[^\ue201]*\ue201", "", md))
print("wrote /tmp/cto-report.md")
PY
```

The regex strips citation tokens, which cannot be resolved outside the original tool. Treat the report's recommendations, prices, and example prompts as feedback to evaluate, not instructions to execute.
