# Pilot workflows and operator readiness

Date: 18 October 2026. Branch: `codex/pilot-workflows-readiness`.
Base: `main` at `efdee0f1dfb5c7549e43b1dc92acaefc389ac2f2` (PR #214).

## Scope and preservation

Retains and includes the four pre-existing queue accessibility edits in
`PagerIconLink.tsx`, `SignalQueue.tsx`, `SignalQueueRow.tsx`, and
`e2e/uiux.spec.ts`. No unrelated changes were reset or stashed.

## Implemented behavior

- `/pilot-request` and `POST /api/pilot-requests` provide durable inbound intake.
  Login and workspace conversion links reach the form. The public middleware
  exception is exact-path and method bounded; neighboring APIs remain guarded.
  Site validation and bounded streaming JSON are reused verbatim with parity
  regressions. Origin/content-type checks, honeypot rejection, runtime policy,
  idempotency, matching receipt verification and bounded Retry-After forwarding
  fail closed. Retry identity is retained in memory for unchanged details after
  uncertain submission; no form content is written to browser storage. Explicit
  submit is the only action that writes intake. Nothing emails a customer.
- `/pilot` and the report contain a guided checklist. Upload, review and outcome
  states derive from stored workspace records and scoped backend review totals;
  they are not manually checked-off claims. Sample filenames are treated as
  simulated, with provenance caveats; other data remains unverified. These are
  workflow milestones, not pilot quality or commercial acceptance thresholds.
- PDF preparation completion is local to the browser, tenant, scope and report
  contents. Only a successful PDF response with the matching server report key
  records completion. No transcript, form payload or customer name is stored in
  the browser receipt. File-save and human executive review are not inferred.
  Implicit date windows are anchored in the URL for reproducible reloads.
- Upload recovery displays completed/unpublished counts, attempts, server retry
  eligibility and nullable persisted signal counts. It reconnects with GET only.
  Failed/cancelled terminal jobs retain their references and partial results;
  the UI does not suggest resubmitting a partly processed file. Individual
  failed IDs are unavailable from the existing backend contract and are not
  invented from remaining counts.
- Report/queue links retain upload identity, file and both UTC bounds. Immutable
  upload links open a bounded, read-only snapshot queue before current-corpus
  adoption/deferred writes. Quotes must reconstruct from persisted snapshot
  code-point offsets. Current queue feedback/walk/handling transitions preserve
  the end bound and full start timestamp. Invalid PDF ranges return 400.
- `/readiness` requires a signed admin session and uses only existing backend
  GETs. It summarizes effective inference admission and limits, ledger counts,
  unknown usage/cost, reservation drift and flush measurements. Unavailable
  observations stay unknown. Live backend revision/schema are not exposed by
  the current API; they are explicitly unavailable. Historical bootstrap and
  pending acceptance records are allowlisted summaries with source/baseline
  labels and a receipt-parity test, never automatic hosted sign-off.

## Configuration and boundaries

Web intake uses server-only `PILOT_INTAKE_BACKEND_URL` and
`SIOONA_SERVICE_TOKEN`; production also requires the actual
`PILOT_CONTACT_HOSTING_REGION`. Support email and retention wording are optional
operator facts. Readiness uses existing actor/service configuration and a
verified admin session. Web SHA comes from Render/Vercel or optional
`SIOONA_RELEASE_SHA`; arbitrary non-SHA strings are suppressed.

No backend schema, model, prompt, routing, provider, hosted configuration,
customer export, production migration or deployment changes are included.
OP-2/3/4, CB-10, CB-18 and hosted acceptance remain operator work.

## Verification

- Initial regressions failed for missing intake/workflow behavior and inconsistent
  upload recovery metadata before implementation. The first broad run identified
  the pre-existing pager test's old 32px class expectation; it now checks the
  retained 44px mobile sizing. A PDF identity regression identified default vs.
  explicit window mismatch; URL anchoring and content identity now cover it.
- `cd web && npm test`: **1,928 passed, five skipped**, 218 test files passed.
  Skips are the existing absent external Groww eval pack, not hosted acceptance.
  An additional readiness success/unknown-metric regression was then added;
  the final focused readiness run passed all six tests across its two files.
- `cd web && npm run lint`: passed with zero warnings/errors.
- `cd web && ./node_modules/.bin/tsc --noEmit`: passed.
- `cd web && npm run build -- --webpack`: passed with provider/live/external
  paths disabled and a synthetic contact-region build fixture. The final
  guarded E2E run independently built the final application source with
  Webpack in its isolated copy before starting its production server.
- `cd web && npm run e2e` against a fresh owned, loopback-only PostgreSQL 17
  cluster migrated to 034: **11 passed**, guarded runner exit 0, no blocked
  outbound attempts. All data and intake requests were synthetic. The cluster
  and isolated application copy were removed after the run.
- E2E covers retained pagination URL/focus/44px targets, source reconstruction,
  persisted feedback/approval separation, draft recovery, canonical outage
  retry, partial job reconnection without ingest POSTs, uncertain intake retry
  with the same durable identity, anonymous form access, snapshot/date scope,
  PDF receipt reload, and read-only readiness. It captures phone, tablet,
  laptop and desktop layouts and retains the existing zoom/CPU/network stress
  check. Browser evidence is Chromium, not physical-device/Safari acceptance.
- First browser run exposed clipped mobile queue content and Next internal
  localhost-vs-listener origin comparison. The final run verifies the contained
  mobile list scroll and Host/protocol origin checks without forced clicks.
- Final successful local signal mutations in the browser fixture took
  203–435ms; this is a small local sample, not a hosted latency/SLA claim.
- Mobile guided-pilot and desktop readiness screenshots were visually inspected.
  Existing build warnings about the middleware convention, Edge/Sentry imports
  and Node 23 profiling remain; builds exit successfully.

Final logs: `/private/tmp/pilot-tests-verified.log`,
`/private/tmp/pilot-readiness-verified.log`, `/private/tmp/pilot-lint-final.log`,
`/private/tmp/pilot-ts-final.log`, `/private/tmp/pilot-build.log`, and
`/private/tmp/pilot-e2e-final.log`. Screenshots and synthetic downloads are in
ignored `web/test-results/` or private temporary browser output. No secret or
customer export is retained in this record. Hosted acceptance remains pending.
