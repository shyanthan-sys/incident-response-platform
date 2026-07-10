"""Normalize incident status values to lowercase strings."""

from typing import Sequence, Union

from alembic import op

revision: str = "003_normalize_incident_status"
down_revision: Union[str, None] = "002_create_incidents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE incidents SET status = 'open' "
        "WHERE status IN ('OPEN', 'Open')"
    )
    op.execute(
        "UPDATE incidents SET status = 'auto_recovered' "
        "WHERE status IN ('AUTO_RECOVERED', 'Auto_Recovered')"
    )
    op.execute(
        "UPDATE incidents SET status = 'resolved' "
        "WHERE status IN ('RESOLVED', 'Resolved')"
    )


def downgrade() -> None:
    pass
