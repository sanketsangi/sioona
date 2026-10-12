"""Runtime-role row level security on high-value tenant tables.

Revision ID: 024_tenant_rls
Revises: 023_inference_budgets
Create Date: 2026-10-12

The migration role must own the tables and bypass RLS. Managed database owners
may have CREATEROLE/BYPASSRLS without being true Postgres superusers.
``sioona_runtime`` is not the owner and has no BYPASSRLS. It is NOLOGIN until
an operator sets a password out of band and points DATABASE_URL at it.
Alembic keeps using MIGRATION_DATABASE_URL, or DATABASE_URL when that is unset.

Policies are created one table at a time. Missing ``app.tenant_id`` matches
no rows. Rollback drops policies per table and keeps the role.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "024_tenant_rls"
down_revision: Union[str, None] = "023_inference_budgets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RUNTIME_ROLE = "sioona_runtime"
RLS_TABLES = (
    "messages",
    "conversations",
    "signal_predictions",
    "signal_feedback",
    "supervised_action_decisions",
    "detection_runs",
    "inference_attempts",
    "signal_evidence",
)


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') THEN
            CREATE ROLE {RUNTIME_ROLE}
              NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
          END IF;
          IF EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}'
              AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)
          ) THEN
            RAISE EXCEPTION 'Unsafe runtime role attributes; operator repair required';
          END IF;
        END
        $$
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {RUNTIME_ROLE}")
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {RUNTIME_ROLE}"
    )
    op.execute(
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {RUNTIME_ROLE}"
    )
    op.execute(
        f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {RUNTIME_ROLE}
        """
    )
    op.execute(
        f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT USAGE, SELECT ON SEQUENCES TO {RUNTIME_ROLE}
        """
    )
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
              USING (tenant_id = current_setting('app.tenant_id', true))
              WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
            """
        )


def downgrade() -> None:
    for table in reversed(RLS_TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {RUNTIME_ROLE}
        """
    )
    op.execute(
        f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          REVOKE USAGE, SELECT ON SEQUENCES FROM {RUNTIME_ROLE}
        """
    )
    op.execute(
        f"REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM {RUNTIME_ROLE}"
    )
    op.execute(
        f"REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM {RUNTIME_ROLE}"
    )
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {RUNTIME_ROLE}")
