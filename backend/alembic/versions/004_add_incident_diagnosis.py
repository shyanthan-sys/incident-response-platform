"""Add diagnosis fields to incidents table."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_add_incident_diagnosis"
down_revision: Union[str, None] = "003_normalize_incident_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("diagnosis", sa.Text(), nullable=True))
    op.add_column("incidents", sa.Column("diagnosis_confidence", sa.Float(), nullable=True))
    op.add_column("incidents", sa.Column("suggested_action", sa.String(length=64), nullable=True))
    op.add_column("incidents", sa.Column("diagnosis_reasoning", sa.Text(), nullable=True))
    op.add_column("incidents", sa.Column("referenced_postmortem_titles", sa.JSON(), nullable=True))
    op.add_column("incidents", sa.Column("diagnosed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("incidents", "diagnosed_at")
    op.drop_column("incidents", "referenced_postmortem_titles")
    op.drop_column("incidents", "diagnosis_reasoning")
    op.drop_column("incidents", "suggested_action")
    op.drop_column("incidents", "diagnosis_confidence")
    op.drop_column("incidents", "diagnosis")
