# Pilot conversion UI and P2 fixes

Date: 18 October 2026. Branch: `feat/pilot-conversion-ui-and-p2-fixes`.
Base: `6b06090338e130b64d622ae34bb0854c1fc59bd3` on `origin/main`.

## Scope and preservation

PR #211 already merged the requested `codex/preserve-site-design-20261017`
head `26fc0d54`; all six required checks and CodeQL passed before merge.
The base has an identical tree to that head. The initial checkout was clean;
no unrelated work was reset, stashed, staged or overwritten.

## Implementation

- Demo re-imports and deferred showcase resets request complete detection
  publication, including empty outputs. Existing backend rejection of legacy
  writes to versioned conversations remains intact. No feedback/history deletion
  bypass, model change or prompt change was introduced.
- Both packages register indexed history tracking before edits. Capture-phase
  popstate restores the original entry before prompting, then replays approved
  traversal once. Router state is retained; Back, Forward, multiple-entry
  traversal and same-page hashes have regressions. Document-exit and link
  protections remain. No form or draft text is stored in history/browser storage.
- Hero starts settled and paused. Source quote / Human review / Approved draft
  pills select illustrative frames; Request a pilot links to the existing form.
  Playback requires input and still stops offscreen, in hidden tabs and for
  reduced motion. Mobile keeps the illustrative draft visible.
- Sample/Partner demo corpora get a dismissible single-line walkthrough strip;
  report navigation retains corpus/window. Existing feedback C shortcut scope
  stays unchanged.
- Upload completion stays visible as a compact panel with counts and a scoped
  Review signals link instead of automatically navigating. Completed worker job
  status returns a count of persisted predictions for that tenant/job; pending
  or older responses remain unavailable. Job recovery remains GET-only.
- Revenue scope/privacy and summary use compact pills, with a direct anchor to
  Customers at risk. Estimate, review-denominator, historical-outcome and PDF
  semantics remain unchanged.
- Launch/UI headers identify merged #210/#212/#211 work and the six-membership
  bootstrap receipt, without closing hosted OP-2/3/4, CB-10 or CB-18 acceptance.

## Verification

- Backend `pytest -q`: 835 passed, 82 skipped. Database-dependent skips are not
  counted as PostgreSQL acceptance.
- Disposable PostgreSQL 17 on loopback: two worker/API/runtime-role isolation
  regressions passed, 68 deselected, including the new completed-job count.
- Site full tests: 126 passed; token guard, lint, TypeScript and Webpack
  production build checked.
- Web full tests: 1,888 passed, five external-pack tests skipped. Subsequent
  upload-recovery/worker/publication subset: 26 passed, including absent/null/
  zero/malformed worker signal counts. Lint, TypeScript and Webpack build checked.
- Guarded canonical-Postgres browser suite: seven tests cover upload completion,
  source reconstruction, draft editing/failure/cancel, Back cancellation without
  Navigation API, persisted feedback/approval, responsive layout and outage retry.
- Local site Chromium and WebKit: settled preview, interactive steps, dirty
  contact Back cancel/confirm with Navigation API disabled, phone/laptop/wide
  overflow checks and zero page errors. Firefox could not launch its installed
  profile; no Firefox acceptance is claimed.
- Clean committed `eval:gate` result is recorded with the exact PR head, with
  artifacts outside the checkout. Token/public-fact files and the token checker
  were not changed.

TypeScript commands run inside each package: the requested root-level
`npm --prefix <package> exec tsc -- --noEmit` prints compiler help because
`npm exec` retains the current directory. Site builds use synthetic launch URL,
contact-policy and region settings, not approved production facts.

Logs/screenshots live under `/private/tmp/pilot-*` and ignored `web/test-results/`.
They contain synthetic data only and are not committed. No hosted migration,
provider call, deployment or customer communication is part of this work.
Independent PR review and hosted launch acceptance remain separate gates.
