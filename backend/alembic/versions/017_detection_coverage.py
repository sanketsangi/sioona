"""Retain classified transcript coverage, including explicit none outputs."""
from alembic import op
import sqlalchemy as sa
revision = "017_detection_coverage"
down_revision = "016_review_cursor_index"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("detection_runs", sa.Column("coverage", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("detection_runs", "coverage")
