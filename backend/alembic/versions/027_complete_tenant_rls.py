"""Extend RLS to the remaining tenant-owned tables.

Revision ID: 027_complete_tenant_rls
Revises: 026_weekly_upload_receipts
"""
from alembic import op

revision = "027_complete_tenant_rls"
down_revision = "026_weekly_upload_receipts"
branch_labels = None
depends_on = None

TABLES = (
    "workspaces", "memberships", "pilot_settings", "taxonomy_overrides",
    "uploads", "upload_conversations", "inference_budgets",
    "inference_run_budgets", "inference_reservations", "inference_controls",
)


def upgrade():
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        predicate = "tenant_id = current_setting('app.tenant_id', true)"
        if table == "inference_controls":
            # Only the configured control tenant may change the global pause.
            predicate += " OR (scope = 'global' AND NULLIF(current_setting('app.global_control_tenant', true), '') = current_setting('app.tenant_id', true))"
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING ({predicate}) WITH CHECK ({predicate})")
    # Admission needs to read the global kill switch for every scoped tenant.
    op.execute("""CREATE POLICY global_control_read ON inference_controls FOR SELECT
        USING (scope = 'global' AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL)""")


def downgrade():
    op.execute("DROP POLICY global_control_read ON inference_controls")
    for table in reversed(TABLES):
        op.execute(f"DROP POLICY tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
