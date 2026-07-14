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


class IncidentListResponse(BaseModel):
    items: list[IncidentResponse]
    total: int
    limit: int
    offset: int


class WebSocketAuthMessage(BaseModel):
    token: str = Field(min_length=1)
