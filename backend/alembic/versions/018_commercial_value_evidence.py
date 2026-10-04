"""Keep exact customer amount provenance with versioned predictions."""
from alembic import op
import sqlalchemy as sa
revision = "018_commercial_value_evidence"
down_revision = "017_detection_coverage"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("signal_predictions", sa.Column("commercial_value_evidence", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("signal_predictions", "commercial_value_evidence")
