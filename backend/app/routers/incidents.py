import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_user_from_token
from app.models.incident import Incident, IncidentStatus
from app.models.user import User
from app.schemas.incident import (
    IncidentListResponse,
    IncidentResponse,
    WebSocketAuthMessage,
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
