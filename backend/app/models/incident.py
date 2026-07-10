import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IncidentStatus(str, enum.Enum):
    """Python member names are UPPERCASE; persisted string values are lowercase.

    Must match Alembic/Postgres incident_status exactly: open, auto_recovered, resolved.
    """

    OPEN = "open"
    AUTO_RECOVERED = "auto_recovered"
    RESOLVED = "resolved"


class AlertType(str, enum.Enum):
    HIGH_LATENCY = "high_latency"
    HIGH_ERRORS = "high_errors"
    SERVICE_DOWN = "service_down"
    TIMEOUT = "timeout"
    CONNECTION_ERROR = "connection_error"
    ERROR_RESPONSE = "error_response"


class Severity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    service_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    alert_type: Mapped[AlertType] = mapped_column(
        Enum(AlertType, name="alert_type", native_enum=False),
        nullable=False,
    )
    severity: Mapped[Severity] = mapped_column(
        Enum(Severity, name="severity", native_enum=False),
        nullable=False,
    )
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(
            IncidentStatus,
            name="incident_status",
            native_enum=False,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
        default=IncidentStatus.OPEN,
        index=True,
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
