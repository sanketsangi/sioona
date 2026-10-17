# OP-4 hosted acceptance checklist

Use an exclusive synthetic-staging window with provider dispatch disabled. Record
the deployed API, web and worker revisions, target IDs, configuration readbacks,
UTC timestamps and operator. Retain counts and bounded error categories only.

- [ ] **Preflight:** schema is at `034_operational_telemetry`; restricted runtime
  credentials are active; global and tenant limits are 500/day and 120/run;
  provider, live ingest and external-action paths are disabled.
- [ ] **Admission:** run `operator_staging_op4_drill.py`; receipt passes both
  pause measurements within 60 seconds, run/daily exhaustion and both
  eight-request races. Reconcile 500 reservations and ledger rows, zero provider
  activity, and final global plus tenant pauses.
- [ ] **Worker pause:** start one synthetic multi-item job, pause the worker by
  controlled configuration and restart, and record the last publication,
  SIGTERM drain, lease release and zero new claims while paused.
- [ ] **Worker resume:** explicitly approve resume, restart the worker, and prove
  only unpublished IDs finish once. Record the final job/receipt state and zero
  duplicate publications or attempts.
- [ ] **Provider outage:** with a synthetic job and kill switch ready, make the
  provider path unavailable, retain the failed metered attempt, commit both
  inference pauses and prove subsequent work uses the heuristic path with zero
  additional provider calls. Resume only after recovery is verified.
- [ ] **Database outage:** interrupt staging database connectivity, prove API and
  worker fail closed without local JSON fallback, restore connectivity, verify
  readiness and canonical reads, then resume queued work without replay.
- [ ] **Alert delivery:** trigger queue-age/dead-letter, unknown-usage or ledger
  reconciliation, database and connector alerts as applicable. Capture the
  configured notification destination receiving each alert, the dashboard alert
  with owner and runbook, acknowledgement, and a recovery notification or clear
  state. Dashboard visibility alone does not prove notification delivery.
- [ ] **Closeout:** attach counts-only receipts, alert timestamps, provider/ledger
  reconciliation, final control states and rollback decision. Sanket reviews and
  signs the exact deployed revisions before OP-4 is marked accepted.

Local disposable verification covers worker pause/resume, database outage and
recovery, provider failure followed by paused heuristic recovery, and delivery
of an active then cleared queue alert through the authenticated admin dashboard.
It does not prove hosted restart behavior, provider-side counts or notification
transport.
