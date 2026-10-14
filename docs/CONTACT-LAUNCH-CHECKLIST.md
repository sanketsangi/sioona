# Public contact intake: local audit and launch gates

Audited 14 October 2026 on main at `66fd97cf6da3422a3cb3528faa3dd25dc5431162`, with local edits. No hosted submission, migration, deployment or customer communication was performed. Existing unrelated work was preserved.

## Flow and storage

`/contact` → `ContactForm` → `POST /api/contact` → service-authenticated `POST /v1/pilot-requests` → `pilot_requests` in the backend's configured `DATABASE_URL`.

The form trims and validates fields, preserves values on failure, reuses the receipt identity when retrying the same payload, and displays success only for an explicit acknowledgement of that identity. The proxy bounds the request to 16 KiB, validates again, forwards a server-only token, and times out after ten seconds. Missing configuration, failed storage and uncertain receipts produce errors, not success.

Storage contains receipt ID, payload hash, name, normalized email, company, optional role/platform/message and database creation timestamp. A commit precedes acknowledgement. Identical retries return the original receipt; changed payload under the same receipt returns 409. PostgreSQL transaction advisory locks serialize receipt and email rate checks. Three new requests per email per day are allowed, with a global rolling 24-hour cap controlled by `PILOT_INTAKE_DAILY_LIMIT` (default 1000). PostgreSQL serializes the global cap across workers before counting or inserting. Identical retries are accepted even when the cap is reached and do not consume another slot. This global pre-pilot intake is not a tenant-owned conversation store. It does not send email automatically.

Local fixes: require backend `ok: true` as well as a matching receipt; require the browser response receipt to match its submitted identity; add read-only operator retrieval with contact details excluded by default; bound direct backend intake bodies to 16 KiB before JSON parsing; add the cross-worker global daily cap; and render operator-supplied privacy facts and a failure recovery mailbox without inventing values.

## Receipt retrieval

No public receipt lookup or operator listing UI exists. The receipt is a reference, not a public credential for reading personal information. An authorized operator can now use a PostgreSQL read-only connection:

```sh
cd /Users/sanket/Documents/Sioona/backend
# Supply DATABASE_URL securely using the approved read-only operator role.
.venv/bin/python -m scripts.lookup_pilot_request RECEIPT_ID
# Only when authorized to view contact data; do not capture output in shared logs:
.venv/bin/python -m scripts.lookup_pilot_request RECEIPT_ID --include-contact
```

The command selects one persisted record, starts a read-only PostgreSQL transaction, and never imports the database initialization module or runs migrations. Exit codes: 0 found, 1 missing, 2 unavailable/invalid invocation. Default output is receipt and creation time. Contact output contains personal information and must not be committed, shared in CI logs, or pasted into tickets. No deletion or communication is performed.

## Required before launch

- Site hosting: set server-only `PILOT_INTAKE_BACKEND_URL` to the reachable HTTPS backend origin (without `/v1/pilot-requests`) and `SIOONA_SERVICE_TOKEN` to the matching backend secret. Never use a `NEXT_PUBLIC_` prefix for either secret. Set `NEXT_PUBLIC_SITE_URL` to the canonical public origin.
- Backend: set `SIOONA_ENV=production`, matching non-empty `SIOONA_SERVICE_TOKEN`, and durable PostgreSQL `DATABASE_URL` with TLS and approved runtime credentials. Non-production without a token intentionally permits requests; verify deployed environment explicitly. Set `PILOT_INTAKE_DAILY_LIMIT` to an approved positive cap; default 1000, allowed range 1–100000.
- Database: an operator must confirm migration `013_pilot_requests` is included in the deployed migration chain, the table/index exist, and the runtime role can select/insert. Do not switch the database to the migration-owner role to bypass permissions. Confirm backups, recovery, hosting region, access restrictions, and retention/deletion procedures. The agent must not run hosted migrations.
- Intake protection: configure perimeter request size/rate limits and abuse controls on the public site route and backend. The global storage cap now prevents rotating emails from creating unlimited records; it does not replace an IP/request rate limit and attackers can exhaust the cap. Both the site proxy and direct backend now bound contact bodies to 16 KiB before parsing. Restrict backend reachability where feasible.
- Operators: provision approved read-only receipt access and assign a human owner for reviewing enquiries and handling access/deletion requests. No automatic email or notification delivery is implemented. Verify any reply promise can be fulfilled manually.
- Privacy notice: approve and publish actual contact-data retention and hosting region. Set approved `PILOT_CONTACT_SUPPORT_EMAIL`, `PILOT_CONTACT_RETENTION` and `PILOT_CONTACT_HOSTING_REGION` on the site before rebuilding. Retention text must cover unsuccessful enquiries and active pilot contacts; region must be the database storing `pilot_requests`, not a visitor or Vercel edge region. The mailbox must be monitored and controlled by the operator. Once configured, privacy enquiries and failed form submissions have a separate email recovery link. Missing values remain explicitly unpublished; no values have been guessed or approved in this conversation. Confirm processing terms and subprocessors without assuming them from local code.
- Hosted acceptance: with explicit approval, submit a synthetic enquiry through the deployed public form, save its receipt, retrieve it from durable storage, retry unchanged payload to prove one record, and confirm a changed payload with the same identity is rejected. Test missing/wrong token, unavailable backend, and rate limiting without exposing contact data in logs. Local tests do not prove these hosted gates.

## Verification limits

Local SQLite tests prove committed readback, trimming, idempotency, conflict, per-email bounds, validation and service authentication. Site tests cover proxy failure/acknowledgement and browser retry identity. PostgreSQL migration, role permissions, read-only driver behavior and concurrent advisory locking require the dedicated test database and hosted operator checks. The browser service could not retrieve public pages; a separate HTTP HEAD check returned 200 for `https://sioona-site.vercel.app/contact`. This proves page reachability only. Deployed intake configuration and browser viewport behavior remain unverified. Launch remains on hold until the gates above have evidence.

Validation: 53 site tests passed before adding the browser receipt regression; all 8 focused proxy/form tests then passed. Site typecheck, lint and production build passed. Six focused backend intake/readback/tenant-isolation tests passed. The broader backend run reported 280 passed, 22 skipped and three failures: `test_shadow_admin_retains_legacy_gate_with_production_settings` and both `test_production_checks_database_role` cases. These are outside this contact change and occur in independently edited files in the shared checkout; no clean-base comparison was performed, so this audit does not attribute their cause. On follow-up, these three checks passed in the independently updated checkout; the subsequent full backend suite passed (289 passed, 24 PostgreSQL checks skipped). This contact task did not implement the concurrent auth/database-role changes.

Local env-file presence check (values not exposed): `site/.env.local` contains non-empty intake URL and token; `backend/.env` contains a database URL but has no non-empty service token or production environment entry. Shell/deployment settings can override these files. This is not evidence that hosted configuration matches or that the configured database is safe to access; no connection was made to it.

Follow-up verification: ten focused intake/body/readback checks passed. A new dedicated PostgreSQL test covers four concurrent requests under a global cap of two, retry acceptance at the cap, persisted receipt readback, and rejection of writes from the lookup read-only transaction. It was skipped because no `PG_TEST_DATABASE_URL` was provided; it refuses databases other than `sioona_migration_test`. No hosted database was accessed.

Final site verification after policy/recovery changes: 60 tests passed; typecheck, lint, production build and diff whitespace checks passed. The recovery mailbox is covered by the browser component test; privacy rendering tests verify configured facts and explicit missing-policy states. Actual public policy values remain unset until approved. No hosted settings, secrets or database configuration were changed.
