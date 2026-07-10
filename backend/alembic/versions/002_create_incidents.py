"""Create incidents table."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_create_incidents"
down_revision: Union[str, None] = "001_create_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=False),
        sa.Column(
            "alert_type",
            sa.Enum(
                "high_latency",
                "high_errors",
                "service_down",
                "timeout",
                "connection_error",
                "error_response",
                name="alert_type",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "severity",
            sa.Enum("low", "medium", "high", "critical", name="severity", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("open", "auto_recovered", "resolved", name="incident_status", native_enum=False),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incidents_service_name"), "incidents", ["service_name"], unique=False)
    op.create_index(op.f("ix_incidents_status"), "incidents", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_incidents_status"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_service_name"), table_name="incidents")
    op.drop_table("incidents")
