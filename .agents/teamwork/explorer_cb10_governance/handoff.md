# Explorer 3 (Governance & Gating Explorer) — Authoritative Governance & Gating Report

**Date:** 2026-10-13  
**Working Directory:** `/Users/sanket/Documents/Sioona/.agents/teamwork/explorer_cb10_governance`  
**Target Card:** CB-10 (Canonical Postgres operations) verification & CB-11 (Durable jobs and backend execution) authorization ruling  
**Parent Coordinator:** `a25279ce-2547-4fbc-a43e-e8bf9d9858ad`

---

## 1. Observation

### 1.1 Decision Log Governance Records (`docs/development/decisions.md`)
1. **Decision Rules (Lines 1–4):**
   > "Agents do not invent these. A row is approved only when it has a date and an approver. Until then the choice is proposed and the current files stay as they are."
2. **Decision D6 — Postgres cutover order (Lines 175–181):**
   > "Status: **approved**  
   > Date: 2026-10-12  
   > Approver: Sanket  
   > Choice: Conversations/messages → feedback/decisions → pilot settings → taxonomy overrides → remaining JSON. In production mode, Postgres is the only writer for operational state. JSON remains only for local demo mode. Production refuses `json-demo` at boot. A fresh production tenant reconstructs the dashboard after a web restart with no runtime JSON file. Demo or sample data cannot overwrite a live tenant."
3. **Decisions D9, D10, D11 Prerequisites & Gating (Lines 189–192):**
   > "## D9, D10, D11  
   >  
   > Status: **not approved**. Do not start CB-11 (D9), live or outbound integrations (D10), or the retention/deletion program (D11) until a row here has a date and an approver."
4. **Context on Classification Worker & CB-11 (Lines 53, 91):**
   > Line 53: "Moving classification onto a worker is CB-11. Budgets and 429 policy are CB-07. Do not start either outside those cards."  
   > Line 91: "Classify-on-a-worker is CB-11. Budgets and 429 policy are CB-07. Taxonomy-on-Neon as source of truth stays blocked (overrides already persist in Neon)"

---

### 1.2 Phase 2 Go Authorization & Preconditions (`docs/development/PHASE_2_GO.md`)
1. **Scope of Authorization (Lines 1–8):**
   > "**Decision:** Phase 2 is authorized. Continue **CB-10** (already started on `main` as `90625f2`). Do not start CB-11 until D9 is recorded. Do not start CB-13 promotion until an approved external corpus meets D5."  
   > "Reviewed against `docs/DEVELOPMENT_COOKBOOK.md` §9 on `main` `7ab84e5deb0c6e41008c7865528f8ec28564aac3`. GitHub Actions run 38291090076 is success for Web, Backend, E2E, Eval gate, Gitleaks, and Marketing site."
2. **Deferred Operator Items (Lines 26–37):**
   - **OP-1:** GitHub rulesets/branch protection (HTTP 403, requires GitHub Pro; closes before CB-19).
   - **OP-2:** No isolated staging; CB-03 membership seed & 30-min shadow window unobserved; production stays `SIOONA_ACTOR_AUTH=off` (closes before production enforce).
   - **OP-3:** Hosted API must be confirmed on `024_tenant_rls`; `sioona_runtime` stays `NOLOGIN` until operator password set and `DATABASE_URL` switched (closes before multi-tenant production).
   - **OP-4:** CB-07 schema `023` pause propagation/exhaustion hosted timing drill unexercised (closes before relying on kill switch during incident).
   - **OP-5:** External holdout manifest is $n=100$; D5 requires at least $n=120$ (at least 30 items across retention, upsell, lead, none) before CB-13.
3. **Phase 2 Start Line & Incomplete CB-10 State (Lines 50–55):**
   > "CB-10 steps already on `main`: entity map in `docs/development/tasks/CB-10.md`, `SIOONA_STATE_MODE`, production refusal of `json-demo`, and live-tenant JSON write guards. Acceptance is still open: one write destination per entity, shadow-read comparison, reconciliation with zero unexplained loss, and a fresh production tenant reconstructing the dashboard with no runtime JSON file."  
   > "Current local `main` is `6ed8350`: conversations/messages slice 1 is committed in `3258c23`, with publication/shadow-report repairs in `6ed8350`. The cited CI run covers `7ab84e5` only, not these local commits or uncommitted dashboard shadow wiring. Resolve local review findings before proceeding to feedback and supervised decisions, the next D6 slice. Production Postgres mode remains off; hosted zero-loss observation requires separate authorization. D9, D10, and D11 are not approved; do not invent them. CB-12 waits on CB-10. CB-14 waits on CB-11 and CB-13. CB-15 can follow the ledger plus the canonical store. Phase 3 stays demand-led."

---

### 1.3 CB-10 Acceptance Criteria & Status in Cookbook and Task Cards
1. **Cookbook §9 Definition-of-Done (`docs/DEVELOPMENT_COOKBOOK.md` Lines 1132–1150):**
   - **Steps:**
     1. Build entity table from `baseline.md`.
     2. Add `SIOONA_STATE_MODE=postgres|json-demo`; production refuses `json-demo` at boot.
     3. Per slice in D6 order: tenant-scoped backfill with reconciliation → shadow-read comparison with no extra writes → cut over → observe → remove JSON writer in a separate PR.
     4. Database outage returns recoverable UI errors instead of falling back to stale JSON.
   - **Acceptance Criteria (Lines 1144–1149):**
     - `[ ] A fresh production tenant reconstructs the dashboard after a web restart with no runtime JSON file.`
     - `[ ] Every write has one documented destination.`
     - `[ ] Demo or sample data cannot overwrite a live tenant (test).`
     - `[ ] Reconciliation shows zero unexplained signal or feedback loss.`
   - **Rollback (Line 1150):**
     - "Keep the old reader until the observation window closes. Never re-enable JSON as a writer after cutover."
2. **CB-11 Specification & Dependencies (`docs/DEVELOPMENT_COOKBOOK.md` Lines 118, 1154–1156):**
   - Line 118: `| D9 | Job runtime | Postgres jobs table with FOR UPDATE SKIP LOCKED, and a Render background worker from the same backend code. No new queue infrastructure. | CB-11 |`
   - Lines 1154–1156:
     > "### CB-11 — Durable jobs and backend execution  
     > **Priority** P1 · **Depends on** CB-06, CB-07, CB-10 · **Decisions** D0 (lifts \"classify-on-FastAPI\" and \"429 retries\"), D9 · **Size** 3–5 days, plus the Python gateway port"
3. **CB-10 Task Card Status (`docs/development/tasks/CB-10.md`):**
   - Line 2: `Status: in-progress`
   - Line 4: `Branch: main Local D6 base SHA: 7ab84e5deb0c6e41008c7865528f8ec28564aac3 Current committed review head SHA: 58bd88b9cdb9e2ec8c42ba35fdcd7c2343689e3d`
   - Line 78: "Pilot claim preserved: nothing auto-sends; human keep-set SignalScore ≥80% with n ≥5. Deferred OP-1–OP-5 and CB-11/CB-13/D9/D10/D11 remain outside this slice. Later D6 entities, hosted observation, and whole-card acceptance remain open; local tests do not prove hosted zero loss."
   - Line 88: "No commit, push, deploy, hosted migration, hosted backfill, or observation-window sign-off performed. Whole CB-10 acceptance remains open."
   - Line 182: "Remaining gates: Final scoped review of the uncommitted slice 2 remains open. The mixed working tree includes unrelated backend, UI, runner, foundation, and marketing changes; whole-file staging of store.ts would mix scopes. The retained-snapshot directory accuracy gap remains the recorded non-blocking slice 1 limitation. Later D6 slices and whole-card acceptance remain open."
   - Line 207: "Hosted reconciliation/observation — still open: Closing this acceptance gap requires the approved tenant and unchanged retained source snapshot, a quiesced ingestion window, persisted counts/hashes plus keep-set/filter/page/feedback/outcome comparisons, investigation of every missing/changed row and target-only row, and a fresh web-process reconstruction without runtime JSON. Record exact application revisions and operator sign-off only after those checks actually run. No target, source snapshot or observation window has been approved for execution in this chat; no equality, zero-loss or whole-card acceptance is claimed."
   - Line 222: "Resolution head SHA: Current HEAD remains 58bd88b9cdb9e2ec8c42ba35fdcd7c2343689e3d; this scoped repair and record update are uncommitted under the standing no-commit instruction. No unrelated dirty file was changed, and no other card, deployment, provider call or hosted observation was started."
4. **Foundation Acceptance Record (`docs/development/FOUNDATION_ACCEPTANCE.md` Line 16):**
   > `| CB-10 | Slice 1 committed locally on main at 3258c23; P1/P2 repairs committed locally at 6ed8350 | Repairs: 159 focused tests passed locally; repair CI unverified | Production Postgres mode off; hosted zero-loss window not run | D6 approved; subsequent review findings remain open; later slices and hosted acceptance remain open |`

---

### 1.4 Codebase Working Tree & Git State
1. **Current Commit History:**
   - Git log confirms `69db4a8 (HEAD -> main) fix(cb-10): preserve ingest detection resume work` sits on top of `58bd88b`, `07009db`, `b7e1137`, `8af44ca`, `cab655f`, `90ad6e2`, `fba1416`, `6ed8350`, `3258c23`.
2. **Uncommitted Working-Tree Files (`HOME=/tmp git status -s`):**
   - 36 modified files, 6 untracked files across backend, web, site, and documentation.
   - Includes uncommitted repairs in `web/src/app/api/signals/[id]/feedback/route.ts`, `route.test.ts`, `acted/route.ts`, `action/route.ts`, `store.ts`, `sync-taxonomy.ts`, `hydrate-conversations.ts`, and `backend/app/api/actor.py`.
3. **Local Test Runs:**
   - Backend tests (`.venv/bin/pytest -q`): **262 passed, 13 skipped, 2 warnings** in 8.37s. (Skipped tests are migration checks requiring disposable Postgres `PG_TEST_DATABASE_URL`).
   - Web targeted suite (104 tests across 8 files: `store.test.ts`, `state-mode.test.ts`, `canonical-conversations.test.ts`, `postgres-resume.test.ts`, `feedback/route.test.ts`, `acted/route.test.ts`, `action/route.test.ts`, `sync-taxonomy.test.ts`): **104 passed, 0 failed**.
   - Web TypeScript (`npx tsc --noEmit`): **Exited 0** (clean).
   - Web ESLint (`npm run lint`): **0 errors, 2 warnings** (`ConversationMessages.tsx:187` TanStack Virtual memoization notice, `NavUser.tsx:147` navigation warning).
   - Component test (`npx vitest run src/components/SignalReviewSuggestedAction.test.ts`): **26 passed, 0 failed**.
   - Hook test (`npx vitest run src/lib/use-mark-acted.test.ts`): **3 passed, 0 failed**.

---

### 1.5 Repository Engineering Invariants
1. **Root `AGENTS.md`:**
   - "Humans approve consequential actions. Nothing auto-sends customer communication or writes external systems without an explicit approved action."
   - "Tenant identity is resolved server-side; never trust a tenant/role value because it arrived in a request."
   - "Evidence shown to operators must reconstruct from persisted source text."
2. **Backend `backend/AGENTS.md`:**
   - "Never run Alembic or SQL against a non-test database from an agent session."
   - "Every tenant-owned table has `tenant_id`; every query filters on it."
   - "Extend `tests/test_postgres_migrations.py` for new tables and constraints. SQLite tests do not prove Postgres behavior."
   - "Expand → backfill → validate → contract. Destructive steps need human review."

---

## 2. Logic Chain

```
[Observation 1.1.1: decisions.md rules: "Agents do not invent these. A row is approved only when it has a date and an approver."]
       │
       ▼
[Observation 1.1.3: decisions.md lines 189–192: "Status: not approved. Do not start CB-11 (D9) ... until a row here has a date and an approver."]
       │
       ▼
[Step 1: Decision D9 has no date and no approver; it is legally UNAPPROVED. Any agent initiating CB-11 directly violates repo governance.]
       │
       ├─────────────────────────────────────────────────────────────────────────────┐
       ▼                                                                             ▼
[Observation 1.2.1: PHASE_2_GO.md line 3: "Decision: Phase 2 is authorized.      [Observation 1.3.2: Cookbook line 1156:
 Continue CB-10... Do not start CB-11 until D9 is recorded."]                   CB-11 Depends on CB-06, CB-07, CB-10.]
       │                                                                             │
       ▼                                                                             ▼
[Step 2: Phase 2 Go specifically unlocks continuing CB-10;                     [Step 3: CB-11 has an unfulfilled dependency
 it explicitly forbids starting CB-11 prior to recording D9.]                     on task CB-10 completion.]
       │                                                                             │
       ├─────────────────────────────────────────────────────────────────────────────┘
       ▼
[Observation 1.1.2: D6 cuts over 5 slices in strict order:
 1. Conversations/messages → 2. Feedback/decisions → 3. Pilot settings → 4. Taxonomy overrides → 5. Remaining JSON]
       │
       ▼
[Observation 1.3.3 & 1.4.1–1.4.2: CB-10 task card line 2 is "Status: in-progress";
 only Slice 1 is committed; Slice 2 is uncommitted in working tree; Slices 3–5 remain uncut;
 working tree is dirty; hosted migration 025 is not run; production Postgres mode is OFF.]
       │
       ▼
[Observation 1.3.1: Cookbook §9 Acceptance requires:
 - Dashboard reconstruction from Postgres without runtime JSON on fresh production tenant;
 - Single documented write destination per entity;
 - Zero unexplained loss on reconciliation.]
       │
       ▼
[Step 4: CB-10 does not meet Definition-of-Done or acceptance criteria.
 Hosted observation and reconciliation have not occurred. CB-10 is PARTIAL, not complete.]
       │
       ▼
[Step 5: Gating assessment:
 1. Hard blocker: Decision D9 is unapproved.
 2. Dependency blocker: Task CB-10 is incomplete and unaccepted.
 3. Operational blocker: Hosted rollout sequence (Migration 025 → FastAPI → Web) and zero-loss window unperformed.]
       │
       ▼
[Conclusion: Task CB-10 is PARTIAL. Proceeding to task CB-11 is strictly BLOCKED.]
```

---

## 3. Caveats

1. **Local vs. Hosted Postgres:** Local unit and mock tests pass (262 pytest, 104 vitest), but local tests with SQLite and in-memory mocks do not prove hosted PostgreSQL RLS, concurrency, or zero-loss behavior.
2. **Working-Tree State:** The working tree contains uncommitted files across web, backend, and documentation. These were inspected in place; per standing read-only instructions, no commits or reverts were executed.
3. **Deferred Operator Items (OP-1–OP-5):** While OP-1 through OP-5 were explicitly exempted as blockers for *continuing* CB-10 within Phase 2, they remain unfulfilled operational preconditions for multi-tenant production enforce (OP-2, OP-3) and model promotion (OP-5).
4. **Scope of D9:** No proposal text in `decisions.md` currently drafts D9. The description in `COOKBOOK.md` line 118 ("Postgres `jobs` table with `FOR UPDATE SKIP LOCKED`, and a Render background worker") is a roadmap specification, not an approved decision.

---

## 4. Conclusion & Authoritative Ruling

### Ruling 1: Is task CB-10 fully complete?
**NO — CB-10 is PARTIAL.**
*Reasons:*
1. **In-Progress Task State:** `docs/development/tasks/CB-10.md` line 2 explicitly designates `Status: in-progress`.
2. **Incomplete D6 Slices:**
   - **Slice 1 (Conversations & Messages):** Committed locally on `main` through HEAD `69db4a8`.
   - **Slice 2 (Feedback & Supervised Decisions):** Implemented locally in the working tree, but uncommitted and not reviewed as a clean git changeset.
   - **Slice 3 (Pilot Settings):** Not cut over as pure Postgres source of truth (still dual-written / overlaid).
   - **Slice 4 (Taxonomy Overrides):** Not cut over as pure Postgres source of truth (still mirrored to JSON).
   - **Slice 5 (Remaining JSON / Store Cache Removal):** JSON writers remain active in non-demo paths; JSON removal PR has not been authored.
3. **Unfulfilled Cookbook §9 Acceptance Criteria:**
   - Hosted reconstruction of the dashboard for a fresh production tenant with no runtime JSON has not occurred.
   - Production mode (`SIOONA_STATE_MODE=postgres`) remains disabled on hosted infrastructure.
   - Zero-loss reconciliation observation window across persisted data has not been run or signed off by an operator.
4. **Unexecuted Hosted Rollout Sequence:** Alembic migration `025_detection_resume.py` has not been applied to hosted Neon databases, and the required 3-step operator sequence (Migration 025 → FastAPI → Web) has not been performed.

---

### Ruling 2: Is proceeding to task CB-11 approved?
**STRICTLY BLOCKED.**
*Authoritative Citations:*
1. **`docs/development/decisions.md` (lines 189–192):**
   > "Status: **not approved**. Do not start CB-11 (D9), live or outbound integrations (D10), or the retention/deletion program (D11) until a row here has a date and an approver."
2. **`docs/development/decisions.md` (lines 1–4):**
   > "Agents do not invent these. A row is approved only when it has a date and an approver. Until then the choice is proposed and the current files stay as they are."
3. **`docs/development/PHASE_2_GO.md` (line 3):**
   > "**Decision:** Phase 2 is authorized. Continue **CB-10** (already started on `main` as `90625f2`). Do not start CB-11 until D9 is recorded."
4. **`docs/DEVELOPMENT_COOKBOOK.md` §9 (line 1156):**
   > "CB-11 — Durable jobs and backend execution: **Depends on** CB-06, CB-07, CB-10 · **Decisions** D0 ..., D9"

---

### 4.3 Required Remediation Steps & Prerequisites to Authorize CB-11

Before task CB-11 can be authorized or started, the following sequential remediation steps must be completed:

1. **Step 1: Complete D6 Slices 2–5 on CB-10**
   - Stage, review, and commit Slice 2 (Feedback & Supervised Decisions) with its regression tests.
   - Implement and cut over Slice 3 (Pilot Settings) to pure Postgres SoT.
   - Implement and cut over Slice 4 (Taxonomy Overrides) to pure Postgres SoT.
   - Implement Slice 5 by removing runtime JSON writers in Postgres mode.
2. **Step 2: Execute Hosted Rollout Sequence for Migration 025**
   - Human operator must run Alembic migration `025_detection_resume.py` on the target hosted PostgreSQL database (Neon).
   - Human operator deploys the FastAPI backend revision containing `detection_resume` routes and verifies health and RBAC/RLS policies.
   - Human operator deploys the Web revision.
3. **Step 3: Run Hosted Zero-Loss Observation & Close CB-10 Acceptance**
   - Quiesce ingestion for an approved tenant/window.
   - Execute read-only shadow comparison and reconciliation; confirm zero unexplained signal or feedback loss.
   - Verify fresh production tenant dashboard reconstruction from Postgres without runtime JSON.
   - Update `docs/development/tasks/CB-10.md` status to `complete` and update `docs/development/FOUNDATION_ACCEPTANCE.md`.
4. **Step 4: Formal Human Approval and Recording of Decision D9**
   - The repository owner / approver (Sanket) must record an explicit approval block in `docs/development/decisions.md` under `## D9 — Job runtime`, providing:
     - `Status: approved`
     - `Date: [YYYY-MM-DD]`
     - `Approver: Sanket`
     - Formal architectural specification of the job runtime (Postgres `jobs` table with `FOR UPDATE SKIP LOCKED` and background worker).
5. **Step 5: Author Task Specification `docs/development/tasks/CB-11.md`**
   - Create task file defining scope, database schema, Python worker (`backend/app/worker.py`), `render.yaml` service definition, and gateway porting with parity tests against CB-09 replay fixtures.

---

## 5. Verification Method

To independently verify the observations, logic, and rulings in this report:

1. **Inspect Decision Governance Records:**
   ```bash
   sed -n '1,15p; 175,192p' docs/development/decisions.md
   ```
   *Verification criterion:* Confirm lines 189–192 read `Status: not approved. Do not start CB-11 (D9)...` with no approver or date.
2. **Inspect Phase 2 Go Record:**
   ```bash
   sed -n '1,10p; 50,55p' docs/development/PHASE_2_GO.md
   ```
   *Verification criterion:* Confirm line 3 states `Do not start CB-11 until D9 is recorded` and line 54 affirms `D9, D10, and D11 are not approved; do not invent them.`
3. **Inspect CB-10 Task Card Status:**
   ```bash
   head -n 10 docs/development/tasks/CB-10.md
   ```
   *Verification criterion:* Confirm line 2 reads `Status: in-progress`.
4. **Inspect Git Working Tree Status:**
   ```bash
   HOME=/tmp git status -s
   ```
   *Verification criterion:* Confirm working tree has uncommitted modifications and that HEAD is `69db4a8`.
5. **Run Local Test Suites:**
   ```bash
   # Backend:
   backend/.venv/bin/pytest -q
   # Expected: 262 passed, 13 skipped

   # Web typecheck & lint:
   cd web && npx tsc --noEmit
   # Expected: exit 0
   cd web && npm run lint
   # Expected: 0 errors, 2 warnings

   # Web CB-10 focused suite:
   cd web && npx vitest run src/lib/store.test.ts src/lib/state-mode.test.ts src/lib/canonical-conversations.test.ts src/app/api/detect/postgres-resume.test.ts "src/app/api/signals/[id]/feedback/route.test.ts" "src/app/api/signals/[id]/acted/route.test.ts" "src/app/api/signals/[id]/action/route.test.ts" src/lib/sync-taxonomy.test.ts
   # Expected: 104 passed
   ```

*Invalidation conditions:*
- If `docs/development/decisions.md` is updated by Sanket with an approved D9 row containing a valid date and approver signature.
- If CB-10 D6 Slices 2–5 are fully implemented, committed, deployed to hosted environments, and signed off with zero-loss reconciliation in `docs/development/tasks/CB-10.md`.
