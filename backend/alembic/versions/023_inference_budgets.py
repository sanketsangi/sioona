"""CB-07 additive controls and conservative attempt reservations.

Deploy 023 before the budget callers. No existing tenant is enabled implicitly.
"""
from alembic import op
import sqlalchemy as sa
revision = "023_inference_budgets"
down_revision = "022_evidence_anchors"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("inference_controls",
        sa.Column("scope", sa.String(), primary_key=True),
        sa.Column("tenant_id", sa.String(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("daily_attempt_limit", sa.Integer(), nullable=False),
        sa.Column("run_attempt_limit", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("limit_usd", sa.Numeric(14, 8)),
        sa.Column("updated_by", sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("daily_attempt_limit > 0 AND run_attempt_limit > 0", name="ck_controls_positive_limits"),
        sa.CheckConstraint("mode IN ('attempts', 'usd')", name="ck_controls_mode"),
        sa.CheckConstraint("(scope = 'global' AND tenant_id IS NULL) OR (scope <> 'global' AND tenant_id IS NOT NULL AND scope = tenant_id)", name="ck_controls_tenant_scope"))
    # A persistent global lock exists before any caller: first-time global pause
    # configuration cannot race admission against an absent row.
    op.bulk_insert(sa.table("inference_controls",
        sa.column("scope", sa.String()), sa.column("enabled", sa.Boolean()),
        sa.column("reason", sa.String()), sa.column("daily_attempt_limit", sa.Integer()),
        sa.column("run_attempt_limit", sa.Integer()), sa.column("mode", sa.String()),
        sa.column("updated_by", sa.String())), [{"scope": "global", "enabled": True,
        "reason": "", "daily_attempt_limit": 1, "run_attempt_limit": 1,
        "mode": "attempts", "updated_by": "migration:023"}])
    op.create_table("inference_budgets",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("budget_day", sa.Date(), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("reserved_usd", sa.Numeric(14, 8), nullable=False),
        sa.Column("spent_usd", sa.Numeric(14, 8), nullable=False),
        sa.CheckConstraint("attempts >= 0 AND reserved_usd >= 0 AND spent_usd >= 0", name="ck_budget_nonnegative"))
    op.create_table("inference_run_budgets",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("run_id", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.CheckConstraint("attempts >= 0", name="ck_run_budget_nonnegative"))
    op.create_table("inference_reservations",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("attempt_id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("budget_day", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reserved_usd", sa.Numeric(14, 8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('authorized', 'settled')", name="ck_reservation_status"))

def downgrade():
    # Human review required: reservation/accounting history would be lost.
    op.drop_table("inference_reservations")
    op.drop_table("inference_run_budgets")
    op.drop_table("inference_budgets")
    op.drop_table("inference_controls")
