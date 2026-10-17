# Render site liveness — 2026-10-17

Scope: local changes for the marketing site at sioona.si; no push or deployment.

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

Activation: merge/push workflow to the default branch and deploy the site changes.
Dashboard-managed Render services must separately set Health Check Path=/health;
editing the proposed Blueprint alone does not update the running service.

Limitations: a liveness endpoint alone does not prevent sleep. GitHub schedules
are best effort and may be delayed/dropped. The requested cron runs at minutes
0,14,28,42,56 (four-minute gap at hour boundaries). Render free services sleep
after 15 minutes idle; always-on traffic consumes shared workspace free hours.
This is not a guarantee against cold starts, restarts or quota exhaustion.
