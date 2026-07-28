"""Add needs_manual_intervention and rejected incident statuses."""

from typing import Sequence, Union

from alembic import op

revision: str = "005_add_remediation_statuses"
down_revision: Union[str, None] = "004_add_incident_diagnosis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Status column uses native_enum=False (VARCHAR); new values require no DDL change.
    pass


def downgrade() -> None:
    pass
