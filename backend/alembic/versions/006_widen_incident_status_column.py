"""Widen incidents.status column from VARCHAR(14) to VARCHAR(50).

Background
----------
Migration 002 created the status column as::

    sa.Enum("open", "auto_recovered", "resolved",
            name="incident_status", native_enum=False)

SQLAlchemy derives the VARCHAR length from the longest value in the enum list
*at table-creation time*, so the column was silently sized to VARCHAR(14)
("auto_recovered" = 14 chars).

Migration 005 added needs_manual_intervention (25 chars) and rejected as valid
application-level values but contained no DDL change, incorrectly assuming a
VARCHAR column with native_enum=False requires no length update.

Any UPDATE writing "needs_manual_intervention" therefore raises
  psycopg2.errors.StringDataRightTruncation
which propagates as an unhandled 500 from the /approve endpoint.

Fix: ALTER the column to VARCHAR(50), giving comfortable headroom for all
current values and any reasonable future additions without a further migration.

Current IncidentStatus values and lengths
------------------------------------------
  open                        4
  auto_recovered             14
  resolved                    8
  needs_manual_intervention  25   ← was the crash trigger
  rejected                    8

VARCHAR(50) accommodates all of these with 25 chars of future headroom.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_widen_incident_status_column"
down_revision: Union[str, None] = "005_add_remediation_statuses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The column currently uses native_enum=False, meaning it is a plain
    # VARCHAR in Postgres (no pg ENUM type to drop/recreate).  A simple
    # ALTER COLUMN TYPE is therefore safe and instant for existing data.
    op.alter_column(
        "incidents",
        "status",
        type_=sa.String(50),
        existing_type=sa.String(14),
        existing_nullable=False,
        existing_server_default="open",
    )


def downgrade() -> None:
    # Narrowing back will fail if any row contains a value longer than 14
    # chars (e.g. needs_manual_intervention).  Callers must ensure those
    # rows are cleaned up before running a downgrade.
    op.alter_column(
        "incidents",
        "status",
        type_=sa.String(14),
        existing_type=sa.String(50),
        existing_nullable=False,
        existing_server_default="open",
    )
