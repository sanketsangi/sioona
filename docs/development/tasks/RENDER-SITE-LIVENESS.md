# Render site liveness — 2026-10-17

Scope: marketing site at sioona.si. User subsequently authorized push and deployment.

- Force the standalone production child process to bind 0.0.0.0, preserve PORT,
  and default to 3000 locally. Existing npm start already runs production code
  without development watchers. No site Dockerfile is present.
- Add unauthenticated GET /health returning {"status":"ok"}, with no database or
  external calls and Cache-Control: no-store.
- Point the proposed sioona-site Blueprint health check to /health.
- Add keep-alive.yml with the requested */14 cron and manual dispatch, bounded
  curl retries and JSON validation. No checkout or repository token access needed.

Verification: health regression test failed before implementation, then passed;
targeted ESLint and git diff --check passed. Disposable startup smoke verified
HOSTNAME=localhost is overridden, PORT=10000 is preserved, and unset/empty PORT
falls back to 3000. Production build is blocked by this environment's Turbopack
worker port binding restriction (Operation not permitted), including an escalated
retry; full build and deployed HTTP acceptance remain unverified.

Hosted acceptance: pushed implementation as 06cf7115 on main and deployed that
commit to sioona-site (dep-db9bov7avr4c73dfl680), confirmed live. Render's hosted
production build passed. Set the dashboard-managed Health Check Path to /health.
Public GET https://sioona.si/health returned HTTP 200, {"status":"ok"}, and
Cache-Control: no-store. GitHub workflow is active; manual run
https://github.com/sanketsangi/sioona/actions/runs/38985140548 completed successfully.
Scheduled execution remains subject to GitHub scheduling; long-term absence of
cold starts has not been established.

Limitations: a liveness endpoint alone does not prevent sleep. GitHub schedules
are best effort and may be delayed/dropped. The requested cron runs at minutes
0,14,28,42,56 (four-minute gap at hour boundaries). Render free services sleep
after 15 minutes idle; always-on traffic consumes shared workspace free hours.
This is not a guarantee against cold starts, restarts or quota exhaustion.
