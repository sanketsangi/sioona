"""Extend append-only audit vocabulary for explicit inference control changes.

Schema-first rollout: apply before deploying the audited control handlers.
Downgrade refuses incompatible retained events; it never deletes audit history.
"""
from alembic import op

revision = '030_inference_control_audit'
down_revision = '029_audit_lifecycle'
branch_labels = None
depends_on = None

OLD_OPERATIONS = "'hold_placed','hold_released','export_created','export_read','deletion_requested','deletion_confirmed','deletion_step','deletion_completed','deletion_blocked','deletion_failed','retention_sweep'"
OLD_RESOURCES = "'tenant','hold','export','deletion','retention'"


def replace_constraints(operations, resources):
    op.drop_constraint('ck_audit_operation', 'audit_events', type_='check')
    op.create_check_constraint('ck_audit_operation', 'audit_events', f'operation IN ({operations})')
    op.drop_constraint('ck_audit_resource', 'audit_events', type_='check')
    op.create_check_constraint('ck_audit_resource', 'audit_events', f'resource_type IN ({resources})')


def upgrade():
    replace_constraints(OLD_OPERATIONS + ",'inference_paused','inference_enabled'",
                        OLD_RESOURCES + ",'inference_control','global_inference_control'")


def downgrade():
    # PostgreSQL validates existing rows; incompatible history aborts atomically.
    replace_constraints(OLD_OPERATIONS, OLD_RESOURCES)
