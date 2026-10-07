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
