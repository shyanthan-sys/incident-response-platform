import asyncio
import json
import logging
import time
from datetime import UTC, datetime

import httpx
import redis.asyncio as aioredis
from sqlalchemy import select

from app.celery_app import celery_app
from app.config import get_settings
from app.database import task_db_session
from app.models.incident import (
    AlertType,
    Incident,
    IncidentStatus,
    Severity,
)

logger = logging.getLogger(__name__)
settings = get_settings()

SERVICE_NAME = "chaos-service"
HEALTH_URL = f"{settings.chaos_service_url.rstrip('/')}/health"
REQUEST_TIMEOUT_SECONDS = 10.0
LATENCY_THRESHOLD_SECONDS = 2.0
INCIDENTS_CHANNEL = "incidents"


async def _fetch_health() -> tuple[int | None, float, str | None]:
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(HEALTH_URL)
            elapsed = time.perf_counter() - start
            return response.status_code, elapsed, None
    except httpx.TimeoutException:
        return None, time.perf_counter() - start, "timeout"
    except httpx.RequestError:
        return None, time.perf_counter() - start, "connection_error"


def _is_abnormal(
    status_code: int | None, elapsed: float, error: str | None
) -> bool:
    if error is not None:
        return True
    if status_code != 200:
        return True
    return elapsed > LATENCY_THRESHOLD_SECONDS


def _classify_abnormality(
    status_code: int | None, elapsed: float, error: str | None
) -> tuple[AlertType, Severity]:
    if error == "timeout":
        return AlertType.TIMEOUT, Severity.HIGH
    if error == "connection_error":
        return AlertType.CONNECTION_ERROR, Severity.CRITICAL
    if status_code == 503:
        return AlertType.SERVICE_DOWN, Severity.CRITICAL
    if status_code == 500:
        return AlertType.HIGH_ERRORS, Severity.HIGH
    if status_code is not None and status_code != 200:
        return AlertType.ERROR_RESPONSE, Severity.MEDIUM
    return AlertType.HIGH_LATENCY, Severity.MEDIUM


def _incident_payload(incident: Incident) -> dict:
    status = incident.status.value if isinstance(incident.status, IncidentStatus) else incident.status
    alert_type = (
        incident.alert_type.value
        if isinstance(incident.alert_type, AlertType)
        else incident.alert_type
    )
    severity = (
        incident.severity.value if isinstance(incident.severity, Severity) else incident.severity
    )
    return {
        "id": str(incident.id),
        "service_name": incident.service_name,
        "alert_type": alert_type,
        "severity": severity,
        "status": status,
        "detected_at": incident.detected_at.isoformat(),
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
    }


async def _publish_incident_event(payload: dict) -> None:
    client = aioredis.from_url(settings.redis_url)
    try:
        await client.publish(INCIDENTS_CHANNEL, json.dumps(payload))
    finally:
        await client.aclose()


async def _get_open_incident(session) -> Incident | None:
    result = await session.execute(
        select(Incident).where(
            Incident.service_name == SERVICE_NAME,
            Incident.status == IncidentStatus.OPEN,
        )
    )
    incident = result.scalar_one_or_none()
    if incident is not None:
        logger.debug(
            "Found open incident id=%s status=%s",
            incident.id,
            incident.status.value,
        )
    return incident


async def _auto_recover_incident(session, open_incident: Incident) -> None:
    incident_id = open_incident.id
    logger.info(
        "Found open incident %s (status=%r), marking auto_recovered",
        incident_id,
        open_incident.status,
    )
    open_incident.status = IncidentStatus.AUTO_RECOVERED
    open_incident.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(open_incident)
    logger.info("Successfully updated incident %s to auto_recovered", incident_id)
    await _publish_incident_event(_incident_payload(open_incident))


async def _monitor_async() -> None:
    status_code, elapsed, error = await _fetch_health()
    abnormal = _is_abnormal(status_code, elapsed, error)
    logger.debug(
        "Health check: status_code=%s elapsed=%.3fs error=%s abnormal=%s",
        status_code,
        elapsed,
        error,
        abnormal,
    )

    async with task_db_session() as session:
        open_incident = await _get_open_incident(session)

        if abnormal and open_incident is None:
            alert_type, severity = _classify_abnormality(status_code, elapsed, error)
            incident = Incident(
                service_name=SERVICE_NAME,
                alert_type=alert_type,
                severity=severity,
                status=IncidentStatus.OPEN,
            )
            session.add(incident)
            await session.commit()
            await session.refresh(incident)
            logger.info(
                "Created open incident %s alert_type=%s severity=%s",
                incident.id,
                alert_type.value,
                severity.value,
            )
            await _publish_incident_event(_incident_payload(incident))

        elif not abnormal and open_incident is not None:
            await _auto_recover_incident(session, open_incident)

        elif abnormal and open_incident is not None:
            logger.debug(
                "Service still abnormal; keeping open incident %s unchanged",
                open_incident.id,
            )


@celery_app.task(name="app.tasks.monitor.check_chaos_service_health")
def check_chaos_service_health() -> None:
    try:
        asyncio.run(_monitor_async())
    except Exception:
        logger.exception("check_chaos_service_health failed")
        raise
