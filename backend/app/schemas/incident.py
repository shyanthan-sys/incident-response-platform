import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.incident import AlertType, IncidentStatus, Severity


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_name: str
    alert_type: AlertType
    severity: Severity
    status: IncidentStatus
    detected_at: datetime
    resolved_at: datetime | None
    diagnosis: str | None = None
    diagnosis_confidence: float | None = None
    suggested_action: str | None = None
    diagnosis_reasoning: str | None = None
    referenced_postmortem_titles: list[str] | None = None
    diagnosed_at: datetime | None = None


class IncidentListResponse(BaseModel):
    items: list[IncidentResponse]
    total: int
    limit: int
    offset: int


class WebSocketAuthMessage(BaseModel):
    token: str = Field(min_length=1)


class RemediationActionResponse(BaseModel):
    status: str
    remediation_success: bool | None = None
    message: str
    action: str | None = None
    postmortem_seeded: bool | None = None
    dead_lettered: bool | None = None
    status_updated: bool | None = None  # True when DB commit succeeded after a failed remediation


class RejectActionResponse(BaseModel):
    status: str
    message: str
