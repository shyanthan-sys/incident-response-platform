import asyncio
import json
import logging
import traceback
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.diagnosis_agent import incident_to_diagnosis_state, stream_diagnosis
from app.database import get_db
from app.dependencies import get_current_user, get_user_from_token
from app.models.incident import Incident, IncidentStatus
from app.models.user import User
from app.schemas.incident import (
    IncidentListResponse,
    IncidentResponse,
    RejectActionResponse,
    RemediationActionResponse,
    WebSocketAuthMessage,
)
from app.services.remediation import (
    IncidentStatusConflictError,
    approve_incident_remediation,
    reject_incident_remediation,
)
from app.ws.manager import IncidentConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["incidents"])


def _get_ws_manager(websocket: WebSocket) -> IncidentConnectionManager:
    return websocket.app.state.incident_ws_manager


@router.get("/incidents", response_model=IncidentListResponse)
async def list_incidents(
    status_filter: IncidentStatus | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    query = select(Incident)
    count_query = select(func.count()).select_from(Incident)

    if status_filter is not None:
        query = query.where(Incident.status == status_filter)
        count_query = count_query.where(Incident.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(
        query.order_by(Incident.detected_at.desc()).limit(limit).offset(offset)
    )
    incidents = result.scalars().all()

    return IncidentListResponse(
        items=incidents,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/incidents/{incident_id}/analyze")
async def analyze_incident(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    initial_state = incident_to_diagnosis_state(incident)

    async def event_stream():
        final_diagnosis: dict | None = None

        async for chunk in stream_diagnosis(initial_state):
            yield f"data: {json.dumps(chunk)}\n\n"
            if isinstance(chunk, dict) and chunk.get("type") == "complete":
                final_diagnosis = chunk.get("diagnosis")

        if final_diagnosis:
            refresh = await db.execute(select(Incident).where(Incident.id == incident_id))
            row = refresh.scalar_one()
            row.diagnosis = final_diagnosis.get("diagnosis")
            row.diagnosis_confidence = final_diagnosis.get("confidence")
            row.suggested_action = final_diagnosis.get("suggested_action")
            row.diagnosis_reasoning = final_diagnosis.get("reasoning")
            row.referenced_postmortem_titles = final_diagnosis.get(
                "referenced_postmortem_titles"
            )
            row.diagnosed_at = datetime.now(UTC)
            await db.commit()

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/incidents/{incident_id}/approve", response_model=RemediationActionResponse)
async def approve_incident(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    try:
        return await approve_incident_remediation(incident, db)
    except IncidentStatusConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Unexpected error approving incident %s:\n%s",
            incident_id,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during remediation approval",
        ) from exc


@router.post("/incidents/{incident_id}/reject", response_model=RejectActionResponse)
async def reject_incident(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    try:
        return await reject_incident_remediation(incident, db)
    except IncidentStatusConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.websocket("/ws/incidents")
async def incidents_websocket(
    websocket: WebSocket,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if token:
        try:
            user = await get_user_from_token(token, db)
        except HTTPException:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
            return
        await websocket.accept()
    else:
        await websocket.accept()
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            message = WebSocketAuthMessage.model_validate_json(raw)
            user = await get_user_from_token(message.token, db)
        except (asyncio.TimeoutError, json.JSONDecodeError, ValueError, HTTPException):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
            return

    manager = _get_ws_manager(websocket)
    await manager.connect(websocket)

    try:
        while True:
            # Keep the connection open; ignore client messages (optional heartbeats).
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.debug("WebSocket client %s disconnected", user.id)
    finally:
        await manager.disconnect(websocket)
