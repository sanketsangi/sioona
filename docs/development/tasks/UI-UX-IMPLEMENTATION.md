# Operator workspace UI/UX implementation

Date: 16 October 2026. Scope: local `web/` implementation of the concrete Phase 1–3 work in `docs/WEB_UI_UX_IMPROVEMENT_PLAN.md`, with technical inspection from Phase 0. Baseline: `main` at `620faf36a96c418dab5bd997c3f83318bf60e330`.

## Boundaries and baseline

Read the entire plan, repository AGENTS, web/AGENTS, installed Next 16.3 Link and error-boundary documentation, current shared components and server contracts. Existing backend rates work and CB-16/staging/task edits are excluded and their tracked diffs were checked against the starting patch. The pre-existing draft-action test contained two unmatched closing declarations. Only those extra declarations were removed; its assertions were retained and updated for the deliberate terminology, evidence ordering and wrapping changes.

The working tree already contained most of the Phase 1–3 implementation at this request’s start; it was preserved, inspected and completed. Source inspection is the baseline. A synthetic intermediate browser run exposed notification auto-opening that hid the queue from accessibility-role queries; this was repaired by making the tray user-operated. There is no pre-redesign screenshot study or representative-operator baseline. No operator research, stakeholder approval, task-time improvement, or usability target is claimed.

## Implemented

- Navigation groups Work / Quality / Administration; clearer visible labels with stable IDs/aliases. Admin destinations use verified server account context and preserve independent route authorization. Screen links preserve known URL context. Corpus switching clears stale selection/page with a notice. Main Insights/brand navigation no longer seeds sample data. Demo replacement requires confirmation; active demo navigation stays nondestructive.
- Stable locked Action Mode; accessible collapsed navigation and quiet notification tray. Sample, Partner demo and Uploaded corpus labels remain textually distinct.
- Supporting evidence precedes draft actions. Persisted source-message joins, position/role descriptions, exact-quote verification for span marks (UTF-16 or code-point offsets), repeated source jumps and drawer focus return. Full surrounding transcript and missing/stale evidence honesty retained. Existing responsive review interaction and centralized status/type/score rendering retained. Phone selected-signal summaries reuse the queue card, quotes wrap, and narrow pane headings have their own row.
- Mark as acted accurately records external handling; Correct gate stays intact with nearby explanation. Approve draft, clipboard copy, feedback and outcomes stay separate. No auto-Correct, new model calls, prompt changes or sending. Save draft / Cancel, dirty-discard confirmation, document/internal-link/traversal protection where supported, recoverable error text retained, persisted success announcements.
- Filter-scope counts and Clear filters without discarding corpus. Review-walk helpers carry page/search in addition to existing filters/corpus/mode. Existing next-signal eligibility and ordering retained.
- Upload file inspection and parse-only mapping preview for accepted formats. Shared validation limits, persistent inline errors, confirmations for populated replacement paths, real worker counts, reconnectable accepted-job URL context and GET-only resume. Polling stops on unmount; server work continues. No invented cancellation or percentages.
- Evaluation labels changed without panel-ID/calculation changes. Explicit Partial denominator and sync qualifications. Missing monetary totals no longer become zero. Revenue grouped into coverage/estimates/outcomes, with current evidence links and historical qualifications. Existing PDF scope/privacy/calculations retained.
- Taxonomy shipped definitions separated from stored overrides; visible empty override states. Economics shares panel chrome and projection labels. Lifecycle uses AppShell and one skip target while preserving server-admin, hold/deletion/export/receipt logic. Policy version, scheduling flag, export expiry and receipt backup information come from responses. Unloaded/failed status does not claim zero legal holds or hardcoded retention durations. Sign-in focuses missing credentials and associates errors with inputs.
- Existing Geist and sio tokens reused. Phone inputs remain 16px; affected buttons have 44px minimum targets. Obsolete locked-mode bounce removed. No rotating help, animated grid-row prescription, decorative animated draft border or unsolicited notification modal.

## Verification

The original full test run exposed the malformed draft-action test; a later run found one obsolete assertion requiring feedback to precede evidence. Both were repaired and the affected suites rerun. Final clean-build and guarded browser results follow below. Final verification uses a fresh disposable PostgreSQL 17 on loopback port 55441, database `sioona_migration_test`; application copied by the existing guarded runner, excluding real data/env files. `DETECT_LLM=0`, empty provider keys and outbound audit enforced. Repository store files are not used for browser runs.

Failing-first regressions cover URL scope/page/search, safe evidence offsets including mixed scripts, missing source anchors, upload GET-only resume, network loss and malformed progress responses, unknown monetary availability, and evidence-before-feedback reading order. Existing ingest, action, feedback and authorization suites are used where relevant. Cosmetic snapshots are not added.

## Remaining contracts and acceptance

- Five representative-operator walkthroughs, terminology approval, comparative timing/error rates and larger-sample success measurements are outstanding. No analytics collection added.
- Worker recovery uses the existing job ID/status/count contract. No job discovery list, resumable file transfer, reliable cancel API, per-stage duration or per-item failure contract was added. Inline detection has no durable job ID to reconnect. Terminal worker failure still requires the existing explicit retry workflow.
- Browser Navigation API can cancel same-document Back/Forward in supporting browsers. Browsers without cancellable traversal retain document-exit and dialog-discard protection; complete cross-browser Back/Forward protection needs additional router/history integration and verification. No draft content is newly persisted to browser storage.
- New source/version history, universal freshness timestamps, saved views, persistent split workspace, full dark theme and additional AI features remain Phase 4/dependency work. No provenance is manufactured. No persistent split workspace was introduced.
- The lifecycle status contract currently provides `policy_version` and `scheduler_enabled`, not retention durations; durations need a server policy-details contract before displaying them as active policy. Export expiry is already provided as `expires_at` and is shown.
- Existing evaluation is the workspace/keep-set score; carrying corpus URL context does not introduce a new per-file scoring API. PDF data semantics and privacy remain the existing report contract.
- No published retention promise, support address, cancellation guarantee, new auth/recovery route, trend, financial conversion or quality threshold was invented.

All changes remain local. No commits, pushes, deployment, hosted migrations/mutations, customer communications, provider configuration or model charges authorized/performed.


## Reproduction and artifact locations

- `npm --prefix web run test -- --testTimeout=30000` — full offline/mocked Vitest regression suite. The larger per-test allowance is for offline eval subprocesses on this loaded local host; assertions and fixture coverage are unchanged. Earlier default-five-second runs timed out those subprocesses under build contention.
- `npm --prefix web run lint` — package source lint.
- `web/node_modules/.bin/tsc -p web/tsconfig.uiux-check.json` — application source check without stale generated route declarations. Ordinary `tsc -p web/tsconfig.json --noEmit` encounters pre-existing `.next` references to deleted `external-actions` routes. The isolated Next build generates fresh route declarations and also checks test/e2e TypeScript.
- Guarded browser command (run from `web/`): `DATABASE_URL=postgresql+psycopg://sioona@127.0.0.1:55441/sioona_migration_test SIOONA_STATE_MODE=postgres SIOONA_E2E_WEB_PORT=3100 SIOONA_E2E_BACKEND_PORT=8100 npm run e2e -- uiux.spec.ts upload-review.spec.ts`. The database must be disposable, migrated and isolated. The two optional port settings avoid disturbing other workspaces.
- Synthetic screenshots: `/private/tmp/sioona-uiux-screenshots/`; test logs: `/private/tmp/sioona-uiux-*.log`. These are temporary local artifacts, not customer exports.
- Responsive screenshots use 1440×900, 1280×800, 820×1180 and 390×844 viewports. The 200% check uses the equivalent 720×450 effective layout width; the wide stress check uses 2880×1800 with CSS zoom 50%. These are layout stress simulations, not a claim of manual browser-toolbar zoom verification.
- Chromium CDP applies 4× CPU throttling and 100 ms network latency during the upload layout stress case. This is a technical check, not a comparative usability or production performance result.
- Actual screen-reader testing, Safari/iOS Low Power Mode, manual toolbar zoom, React DevTools render profiling, five operator walkthroughs and comparative research remain human/browser acceptance work.

Accessibility repairs found by measurement: phone feedback controls initially measured 36px despite the base-layer 44px rule; the final override lives in the utility layer. Secondary copy initially measured 4.35:1 on the muted workspace surface; the existing light-theme neutral token was darkened from OKLCH 0.556 to 0.53. Chromium measured the final secondary text at 5.25:1 on the white card surface and 4.82:1 on the muted workspace surface. The target rule also covers tooltip-wrapped buttons, whose `data-slot` differs from a bare Button. These measurements cover selected neutral text pairs and core review controls, not a complete assistive-technology audit.

During an intermediate hybrid-mode re-upload against already-versioned conversations, the backend rejected the legacy prediction mirror (`Use complete detection publication for versioned conversations`), producing an incomplete-sync warning. Final persistence/browser acceptance uses canonical Postgres mode. Repair of that legacy dual-write backend path is separate work; the interface must retain the partial-sync qualification. No hosted acceptance is claimed.
